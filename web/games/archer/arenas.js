// Illustrated arenas: sky, parallax layers, structures (cached sprites), ground, animated details, weather config.
import { TAU, clamp, lerp, mix, shade, rgba, mulberry, fbm1, makeCanvas, roundRect, star } from './util.js';

// ---------------- generic painters (layer coordinates = world units, ground at y=0) ----------------
function ridgePath(c, x0, x1, base, amp, f, n, step = 8) {
  c.beginPath(); c.moveTo(x0, 4000);
  for (let x = x0; x <= x1 + step; x += step) c.lineTo(x, base - n(x * f) * amp);
  c.lineTo(x1 + step, 4000); c.closePath();
}
function ridge(c, e, o) {
  const n = fbm1(o.seed, o.oct || 5), f = o.freq || 0.004;
  ridgePath(c, e.x0, e.x1, o.base, o.amp, f, n, o.step || 8);
  if (o.grad) { const g = c.createLinearGradient(0, o.base - o.amp, 0, o.base + (o.gradH || 200)); g.addColorStop(0, o.color); g.addColorStop(1, o.grad); c.fillStyle = g; } else c.fillStyle = o.color;
  c.fill();
  if (o.rim) { // lit edge: shift path down-away from light, fill rim color clipped
    c.save(); ridgePath(c, e.x0, e.x1, o.base, o.amp, f, n, o.step || 8); c.clip();
    c.lineWidth = o.rimW || 3; c.strokeStyle = o.rim; ridgePath(c, e.x0, e.x1, o.base, o.amp, f, n, o.step || 8); c.stroke();
    c.restore();
  }
  if (o.snow) { // snow caps on peaks
    c.save(); ridgePath(c, e.x0, e.x1, o.base, o.amp, f, n, o.step || 8); c.clip();
    const n2 = fbm1(o.seed + 7, 3); c.fillStyle = o.snow; c.beginPath(); c.moveTo(e.x0, -4000);
    for (let x = e.x0; x <= e.x1 + 8; x += 8) { const top = o.base - n(x * f) * o.amp; c.lineTo(x, Math.min(top + 8 + n2(x * 0.02) * 30, o.base - o.amp * 0.55 + n2(x * 0.01) * 40)); }
    c.lineTo(e.x1 + 8, -4000); c.closePath(); c.fill(); c.restore();
  }
  return n;
}
function haze(c, e, y0, y1, col, a0 = 0, a1 = 1) {
  const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, rgba(col, a0)); g.addColorStop(1, rgba(col, a1));
  c.fillStyle = g; c.fillRect(e.x0, y0, e.x1 - e.x0, y1 - y0);
}
function pine(c, x, y, h, col, snow) {
  const w = h * 0.42; c.fillStyle = col; c.beginPath(); c.moveTo(x, y - h);
  for (let i = 1; i <= 4; i++) { const yy = y - h + h * i / 4.6, ww = w * i / 4; c.lineTo(x + ww, yy); c.lineTo(x + ww * 0.45, yy - h * 0.04); }
  c.lineTo(x + w * 0.12, y); c.lineTo(x - w * 0.12, y);
  for (let i = 4; i >= 1; i--) { const yy = y - h + h * i / 4.6, ww = w * i / 4; c.lineTo(x - ww * 0.45, yy - h * 0.04); c.lineTo(x - ww, yy); }
  c.closePath(); c.fill();
  if (snow) { c.fillStyle = snow; for (let i = 1; i <= 4; i++) { const yy = y - h + h * i / 4.6, ww = w * i / 4; c.beginPath(); c.moveTo(x - ww * 0.8, yy - 1); c.quadraticCurveTo(x, yy - h * 0.12, x + ww * 0.8, yy - 1); c.lineTo(x + ww * 0.4, yy - h * 0.05); c.lineTo(x - ww * 0.4, yy - h * 0.05); c.fill(); } }
}
function roundTree(c, x, y, h, col, col2) {
  c.fillStyle = col2 || col; c.fillRect(x - h * 0.04, y - h * 0.45, h * 0.08, h * 0.45);
  c.fillStyle = col; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; c.beginPath(); c.arc(x + Math.cos(a) * h * 0.18, y - h * 0.62 + Math.sin(a) * h * 0.14, h * 0.24, 0, TAU); c.fill(); }
  c.beginPath(); c.arc(x, y - h * 0.7, h * 0.28, 0, TAU); c.fill();
}
function speckle(c, r, x0, y0, w, h, n, col, s0 = 1, s1 = 3) { c.fillStyle = col; for (let i = 0; i < n; i++) { const s = r.range(s0, s1); c.fillRect(x0 + r() * w, y0 + r() * h, s, s * r.range(0.5, 1)); } }

// clip-and-shade a vertical body: lit side highlight + far side shadow (light from L.x sign)
function bodyShade(c, x0, x1, y0, y1, L, hiCol, shCol, k = 0.35) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  const lit = L.x < 0; // light from left
  g.addColorStop(0, rgba(lit ? hiCol : shCol, lit ? 0.32 : 0.5)); g.addColorStop(k, rgba(lit ? hiCol : shCol, 0));
  g.addColorStop(1 - k, rgba(lit ? shCol : hiCol, 0)); g.addColorStop(1, rgba(lit ? shCol : hiCol, lit ? 0.5 : 0.32));
  c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, y1 - y0);
}
function aoBottom(c, x0, x1, y, h, col = '#000', a = 0.5) { const g = c.createLinearGradient(0, y - h, 0, y); g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a)); c.fillStyle = g; c.fillRect(x0, y - h, x1 - x0, h); }
function aoTop(c, x0, x1, y, h, col = '#000', a = 0.45) { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(x0, y, x1 - x0, h); }
function glow(c, x, y, r, col, a = 1) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
function grassTop(c, r, x0, x1, y, col, col2, flowers) {
  c.fillStyle = col; c.beginPath(); c.moveTo(x0 - 6, y + 10);
  for (let x = x0 - 6; x <= x1 + 6; x += 5) c.lineTo(x, y - r.range(0, 7));
  c.lineTo(x1 + 6, y + 14); for (let x = x1 + 6; x >= x0 - 6; x -= 9) c.lineTo(x, y + 12 + r.range(0, 12)); c.closePath(); c.fill();
  c.strokeStyle = col2; c.lineWidth = 2; c.lineCap = 'round';
  for (let i = 0; i < (x1 - x0) / 4; i++) { const x = r.range(x0, x1), h = r.range(5, 13); c.beginPath(); c.moveTo(x, y + 3); c.quadraticCurveTo(x + r.range(-3, 3), y - h * 0.5, x + r.range(-5, 5), y - h); c.stroke(); }
  if (flowers) for (let i = 0; i < (x1 - x0) / 22; i++) { const x = r.range(x0, x1), fy = y - r.range(2, 9); c.fillStyle = r.pick(flowers); c.beginPath(); c.arc(x, fy, 2.6, 0, TAU); c.fill(); c.fillStyle = '#fff6b0'; c.beginPath(); c.arc(x, fy, 1, 0, TAU); c.fill(); }
}

// ---------------- structure painters: draw a platform whose top-center walkable surface is at (s.x, s.top) ----------------
function paintCliff(c, s, A, r) {
  const L = A.light.L, w = s.w, top = s.top, n = fbm1(s.seed, 4);
  const path = (dx = 0, dy = 0) => {
    c.beginPath(); c.moveTo(s.x - w / 2 + dx, top + dy);
    for (let y = top; y <= 60; y += 10) { const t = (y - top) / (60 - top); c.lineTo(s.x - w / 2 - t * t * w * 0.35 - n(y * 0.02) * 26 + dx, y + dy); }
    for (let y = 60; y >= top; y -= 10) { const t = (y - top) / (60 - top); c.lineTo(s.x + w / 2 + t * t * w * 0.35 + n(y * 0.02 + 40) * 26 + dx, y + dy); }
    c.closePath();
  };
  path(); const g = c.createLinearGradient(0, top, 0, 60); g.addColorStop(0, A.pal.rock); g.addColorStop(1, A.pal.rock2); c.fillStyle = g; c.fill();
  c.save(); path(); c.clip();
  // strata
  for (let y = top + 18; y < 60; y += r.range(14, 30)) { c.strokeStyle = rgba(A.pal.rockLine, 0.55); c.lineWidth = r.range(1.5, 3.5); c.beginPath(); for (let x = s.x - w; x < s.x + w; x += 12) c.lineTo(x, y + Math.sin(x * 0.03 + y) * 3 + n(x * 0.05) * 6); c.stroke(); }
  // facets: angular light planes
  for (let i = 0; i < 9; i++) { const yy = r.range(top + 20, 40), xx = s.x + r.range(-w * 0.6, w * 0.6), hh = r.range(30, 70); c.fillStyle = rgba(r() < 0.5 ? '#ffffff' : '#000000', r.range(0.04, 0.09)); c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + r.range(15, 35), yy + hh * 0.3); c.lineTo(xx + r.range(5, 20), yy + hh); c.lineTo(xx - r.range(10, 25), yy + hh * 0.6); c.closePath(); c.fill(); }
  // cracks
  c.strokeStyle = rgba(A.pal.rockLine, 0.8); c.lineWidth = 1.6;
  for (let i = 0; i < 6; i++) { let x = s.x + r.range(-w * 0.45, w * 0.45), y = top + r.range(20, -top * 0.7); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += r.range(-8, 8); y += r.range(6, 14); c.lineTo(x, y); } c.stroke(); }
  speckle(c, r, s.x - w, top, w * 2, 60 - top, 260, rgba('#000000', 0.12), 1, 3);
  speckle(c, r, s.x - w, top, w * 2, 60 - top, 120, rgba('#ffffff', 0.08), 1, 2.5);
  bodyShade(c, s.x - w * 0.9, s.x + w * 0.9, top, 80, L, A.pal.rockHi, A.pal.rockSh, 0.42);
  aoTop(c, s.x - w, s.x + w, top, 40, '#1a0f20', 0.35);
  // wet base
  aoBottom(c, s.x - w * 1.2, s.x + w * 1.2, 60, 70, A.pal.rockSh, 0.6);
  c.restore();
  // rim light edge on sun side
  c.save(); path(); c.clip(); c.lineWidth = 5; c.strokeStyle = rgba(A.light.rim, 0.55); path(L.x * 3, L.y * 3 + 3); c.globalCompositeOperation = 'destination-out'; c.fill(); c.restore();
  c.save(); path(); c.clip(); c.strokeStyle = rgba(A.light.rim, 0.5); c.lineWidth = 3; path(-L.x * 2.5, 0); c.restore();
  path(); c.strokeStyle = rgba(A.pal.ink, 0.85); c.lineWidth = 3; c.stroke();
  grassTop(c, r, s.x - w / 2, s.x + w / 2, top, A.pal.grass, A.pal.grass2, A.pal.flowers);
  // hanging vines / roots
  c.strokeStyle = A.pal.grass2; c.lineWidth = 2.2; for (let i = 0; i < 7; i++) { const x = s.x + r.range(-w / 2, w / 2); const L2 = r.range(12, 45); c.beginPath(); c.moveTo(x, top + 8); c.quadraticCurveTo(x + r.range(-6, 6), top + L2 * 0.6, x + r.range(-4, 4), top + L2); c.stroke(); c.fillStyle = A.pal.grass; c.beginPath(); c.arc(x, top + L2, 2.5, 0, TAU); c.fill(); }
  // small rocks + bush on the outer side
  const out = s.side < 0 ? -1 : 1;
  c.fillStyle = A.pal.grass2; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(s.x + out * (w * 0.32 + i * 9), top - 6 - (i % 2) * 5, 11 - i * 2, 0, TAU); c.fill(); }
  c.fillStyle = A.pal.grass; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(s.x + out * (w * 0.32 + i * 9) - 2, top - 9 - (i % 2) * 5, 8 - i * 2, 0, TAU); c.fill(); }
}

function paintTower(c, s, A, r) {
  const L = A.light.L, w = s.w, top = s.top, x0 = s.x - w / 2, x1 = s.x + w / 2, bot = 60;
  const stone = A.pal.stone, stone2 = A.pal.stone2;
  // corbel ledge geometry
  const ledgeY = top + 26;
  // main shaft (slightly narrower than parapet)
  const sx0 = x0 + 10, sx1 = x1 - 10;
  c.fillStyle = stone; c.fillRect(sx0, ledgeY, sx1 - sx0, bot - ledgeY);
  c.save(); c.beginPath(); c.rect(sx0, ledgeY, sx1 - sx0, bot - ledgeY); c.clip();
  // bricks
  const bh = 16;
  for (let y = ledgeY, row = 0; y < bot; y += bh, row++) {
    for (let x = sx0 - (row % 2) * 17; x < sx1; x += 34) {
      const v = r.range(-0.08, 0.08); c.fillStyle = shade(stone, v); c.fillRect(x + 1.5, y + 1.5, 31, bh - 3);
      c.fillStyle = rgba('#ffffff', 0.12); c.fillRect(x + 1.5, y + 1.5, 31, 2);
      c.fillStyle = rgba('#000000', 0.16); c.fillRect(x + 1.5, y + bh - 3.5, 31, 2);
    }
  }
  c.fillStyle = rgba(stone2, 0.0);
  // moss patches
  for (let i = 0; i < 9; i++) { const mx = r.range(sx0, sx1), my = r.range(ledgeY + 40, bot); c.fillStyle = rgba(A.pal.moss, r.range(0.35, 0.6)); c.beginPath(); c.ellipse(mx, my, r.range(8, 22), r.range(4, 9), 0, 0, TAU); c.fill(); }
  // arched window with warm light
  const wy = ledgeY + 70 + r.range(0, 40), wx = s.x + (s.side < 0 ? -12 : 12);
  c.fillStyle = '#2a1a22'; c.beginPath(); c.moveTo(wx - 13, wy + 34); c.lineTo(wx - 13, wy); c.arc(wx, wy, 13, Math.PI, 0); c.lineTo(wx + 13, wy + 34); c.closePath(); c.fill();
  const wg = c.createLinearGradient(0, wy - 13, 0, wy + 34); wg.addColorStop(0, '#ffe39a'); wg.addColorStop(1, '#ff9a3c'); c.fillStyle = wg;
  c.beginPath(); c.moveTo(wx - 9, wy + 31); c.lineTo(wx - 9, wy); c.arc(wx, wy, 9, Math.PI, 0); c.lineTo(wx + 9, wy + 31); c.closePath(); c.fill();
  c.fillStyle = '#2a1a22'; c.fillRect(wx - 1.2, wy - 9, 2.4, 40); c.fillRect(wx - 9, wy + 10, 18, 2.4);
  glow(c, wx, wy + 12, 60, '#ffb347', 0.25);
  // banner
  const by = ledgeY + 12, bx = s.x - (s.side < 0 ? -26 : 26), bw = 34, bhh = 92;
  c.fillStyle = '#3a2a22'; c.fillRect(bx - bw / 2 - 5, by - 2, bw + 10, 5);
  const bc = s.side < 0 ? A.pal.bannerL : A.pal.bannerR;
  c.fillStyle = bc; c.beginPath(); c.moveTo(bx - bw / 2, by); c.lineTo(bx + bw / 2, by); c.lineTo(bx + bw / 2, by + bhh); c.lineTo(bx, by + bhh - 14); c.lineTo(bx - bw / 2, by + bhh); c.closePath(); c.fill();
  const bgr = c.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0); bgr.addColorStop(0, rgba('#000000', 0.25)); bgr.addColorStop(0.4, rgba('#ffffff', 0.12)); bgr.addColorStop(1, rgba('#000000', 0.3)); c.fillStyle = bgr; c.fill();
  c.strokeStyle = '#f2c94c'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(bx - bw / 2 + 4, by + 4); c.lineTo(bx - bw / 2 + 4, by + bhh - 6); c.moveTo(bx + bw / 2 - 4, by + 4); c.lineTo(bx + bw / 2 - 4, by + bhh - 6); c.stroke();
  c.fillStyle = '#f2c94c'; c.beginPath(); star(c, bx, by + 36, 11, 4.5, 5, 0); c.fill();
  // crossed arrows emblem under star
  c.strokeStyle = '#f2c94c'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx - 9, by + 52); c.lineTo(bx + 9, by + 66); c.moveTo(bx + 9, by + 52); c.lineTo(bx - 9, by + 66); c.stroke();
  bodyShade(c, sx0, sx1, ledgeY, bot, L, A.pal.stoneHi, A.pal.stoneSh, 0.38);
  aoTop(c, sx0, sx1, ledgeY, 50, '#0d0a1a', 0.55);
  aoBottom(c, sx0, sx1, bot, 120, A.pal.stoneSh, 0.65);
  c.restore();
  c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 3; c.strokeRect(sx0, ledgeY, sx1 - sx0, bot - ledgeY + 10);
  // corbels under parapet
  for (let x = x0 + 6; x < x1 - 6; x += 22) { c.fillStyle = shade(stone, -0.1); c.beginPath(); c.moveTo(x, ledgeY - 2); c.lineTo(x + 14, ledgeY - 2); c.lineTo(x + 11, ledgeY + 14); c.lineTo(x + 3, ledgeY + 14); c.closePath(); c.fill(); c.strokeStyle = rgba(A.pal.ink, 0.8); c.lineWidth = 2; c.stroke(); }
  // parapet slab
  const pg = c.createLinearGradient(0, top, 0, ledgeY); pg.addColorStop(0, shade(stone, 0.18)); pg.addColorStop(1, shade(stone, -0.12));
  c.fillStyle = pg; c.beginPath(); roundRect(c, x0, top, w, ledgeY - top, 3); c.fill(); c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 3; c.stroke();
  c.fillStyle = rgba('#ffffff', 0.25); c.fillRect(x0 + 3, top + 2, w - 6, 3);
  for (let x = x0 + 18; x < x1 - 8; x += 30) { c.strokeStyle = rgba(A.pal.ink, 0.35); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, top + 4); c.lineTo(x, ledgeY - 2); c.stroke(); }
  // merlons on the outer half (behind character)
  const out = s.side < 0 ? -1 : 1;
  for (let i = 0; i < 2; i++) {
    const mx = s.x + out * (w / 2 - 14 - i * 34);
    const mg = c.createLinearGradient(mx - 12, 0, mx + 12, 0); mg.addColorStop(0, shade(stone, L.x < 0 ? 0.12 : -0.15)); mg.addColorStop(1, shade(stone, L.x < 0 ? -0.15 : 0.12));
    c.fillStyle = mg; c.beginPath(); roundRect(c, mx - 12, top - 30, 24, 32, 3); c.fill(); c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 3; c.stroke();
    c.fillStyle = rgba('#ffffff', 0.22); c.fillRect(mx - 10, top - 28, 20, 3);
  }
  // torch sconce on inner face
  const tx = s.x - out * (w / 2 - 6), ty = ledgeY + 40;
  c.fillStyle = '#2b2026'; c.fillRect(tx - 3, ty, 6, 18); c.beginPath(); c.moveTo(tx - 7, ty); c.lineTo(tx + 7, ty); c.lineTo(tx + 4, ty + 8); c.lineTo(tx - 4, ty + 8); c.fill();
  s.torch = { x: tx, y: ty - 4 };
}

function paintBuilding(c, s, A, r) {
  const L = A.light.L, w = s.w, top = s.top, x0 = s.x - w / 2, x1 = s.x + w / 2, bot = 60;
  const wall = s.side < 0 ? A.pal.wallL : A.pal.wallR;
  c.fillStyle = wall; c.fillRect(x0, top, w, bot - top);
  c.save(); c.beginPath(); c.rect(x0, top, w, bot - top); c.clip();
  // brick texture
  for (let y = top + 18; y < bot; y += 8) for (let x = x0 + ((y / 8) % 2) * 9; x < x1; x += 18) { c.fillStyle = rgba(r() < 0.5 ? '#000000' : '#ffffff', r.range(0.02, 0.06)); c.fillRect(x, y, 17, 7); }
  // windows grid
  const cols = Math.floor((w - 30) / 38), mx = x0 + (w - cols * 38) / 2 + 4;
  for (let y = top + 52, row = 0; y < bot - 20; y += 62, row++) for (let i = 0; i < cols; i++) {
    const x = mx + i * 38, lit = r() < 0.45; const col = lit ? r.pick(['#ffd36e', '#ffb35c', '#9ff0ff', '#ff9ad5']) : '#1b1d3a';
    c.fillStyle = '#121327'; c.fillRect(x - 2, y - 2, 34, 42);
    if (lit) { const gg = c.createLinearGradient(0, y, 0, y + 38); gg.addColorStop(0, col); gg.addColorStop(1, shade(col, -0.3)); c.fillStyle = gg; } else c.fillStyle = col;
    c.fillRect(x, y, 30, 38);
    if (lit) { c.fillStyle = rgba('#000000', 0.25); c.fillRect(x + r.range(4, 18), y + 14, r.range(5, 9), 24); glow(c, x + 15, y + 19, 40, col, 0.18); }
    c.fillStyle = '#121327'; c.fillRect(x + 14, y, 2, 38); c.fillRect(x, y + 17, 30, 2);
    c.fillStyle = shade(wall, -0.25); c.fillRect(x - 4, y + 40, 38, 4); // sill
  }
  // fire escape on outer side
  const fx = s.side < 0 ? x0 + 6 : x1 - 46;
  c.strokeStyle = '#1a1626'; c.lineWidth = 2.5;
  for (let y = top + 96; y < bot - 30; y += 62) { c.strokeRect(fx, y, 40, 3); for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(fx + k * 8, y); c.lineTo(fx + k * 8, y - 16); c.stroke(); } c.beginPath(); c.moveTo(fx, y - 16); c.lineTo(fx + 40, y - 16); c.stroke(); c.beginPath(); c.moveTo(fx + 4, y + 3); c.lineTo(fx + 36, y + 59); c.stroke(); }
  // neon sign
  const sy = top + 30, sxx = s.side < 0 ? x1 - 30 : x0 + 30;
  s.neon = { x: sxx, y: sy + 70, col: s.side < 0 ? '#ff3fa4' : '#3ff4ff' };
  bodyShade(c, x0, x1, top, bot, L, A.pal.wallHi, '#05040e', 0.3);
  aoBottom(c, x0, x1, bot, 200, '#05040e', 0.8);
  c.restore();
  c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 3; c.strokeRect(x0, top, w, bot - top + 10);
  // roof parapet
  c.fillStyle = shade(wall, 0.12); c.fillRect(x0 - 6, top - 4, w + 12, 12); c.strokeRect(x0 - 6, top - 4, w + 12, 12);
  c.fillStyle = rgba(A.light.rim, 0.55); c.fillRect(x0 - 6, top - 4, w + 12, 2.5);
  // rooftop props on outer side: water tower or AC unit
  const out = s.side < 0 ? -1 : 1;
  const px = s.x + out * (w / 2 - 34);
  if (s.seed % 2) { // water tower
    c.strokeStyle = '#1a1626'; c.lineWidth = 3; c.beginPath(); c.moveTo(px - 18, top - 4); c.lineTo(px - 14, top - 40); c.moveTo(px + 18, top - 4); c.lineTo(px + 14, top - 40); c.moveTo(px - 16, top - 20); c.lineTo(px + 16, top - 30); c.stroke();
    const tg = c.createLinearGradient(px - 22, 0, px + 22, 0); tg.addColorStop(0, '#8a5a3a'); tg.addColorStop(0.5, '#a8744c'); tg.addColorStop(1, '#4a2e22');
    c.fillStyle = tg; c.beginPath(); roundRect(c, px - 22, top - 92, 44, 54, 4); c.fill(); c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 2.5; c.stroke();
    c.strokeStyle = rgba('#2a1a14', 0.7); c.lineWidth = 2; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(px - 22, top - 92 + k * 13); c.lineTo(px + 22, top - 92 + k * 13); c.stroke(); }
    c.fillStyle = '#3a2620'; c.beginPath(); c.moveTo(px - 26, top - 92); c.lineTo(px, top - 112); c.lineTo(px + 26, top - 92); c.closePath(); c.fill(); c.stroke();
  } else { // AC unit + antenna
    c.fillStyle = '#7d8aa6'; c.beginPath(); roundRect(c, px - 24, top - 30, 48, 26, 3); c.fill(); c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 2.5; c.stroke();
    c.strokeStyle = '#3b4560'; c.lineWidth = 1.6; c.beginPath(); c.arc(px + 8, top - 17, 9, 0, TAU); c.stroke(); for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(px - 20, top - 25 + k * 5); c.lineTo(px - 6, top - 25 + k * 5); c.stroke(); }
  }
  const ax = s.x + out * (w / 2 - 8);
  c.strokeStyle = '#1a1626'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(ax, top - 4); c.lineTo(ax, top - 70); c.moveTo(ax - 8, top - 52); c.lineTo(ax + 8, top - 52); c.moveTo(ax - 5, top - 62); c.lineTo(ax + 5, top - 62); c.stroke();
  s.blink = { x: ax, y: top - 72 };
}

function paintTreeTower(c, s, A, r) {
  const L = A.light.L, w = s.w, top = s.top, bot = 60;
  const tw = w * 0.5, n = fbm1(s.seed, 3);
  const trunk = (dx = 0) => { c.beginPath(); c.moveTo(s.x - tw / 2 + dx, top + 10); for (let y = top + 10; y <= bot; y += 10) { const t = (y - top) / (bot - top); c.lineTo(s.x - tw / 2 - t * t * t * 50 - n(y * 0.02) * 10 + dx, y); } for (let y = bot; y >= top + 10; y -= 10) { const t = (y - top) / (bot - top); c.lineTo(s.x + tw / 2 + t * t * t * 50 + n(y * 0.02 + 9) * 10 + dx, y); } c.closePath(); };
  trunk(); const g = c.createLinearGradient(s.x - tw, 0, s.x + tw, 0); g.addColorStop(0, A.pal.bark2); g.addColorStop(L.x < 0 ? 0.35 : 0.65, A.pal.bark); g.addColorStop(1, A.pal.bark2); c.fillStyle = g; c.fill();
  c.save(); trunk(); c.clip();
  for (let i = 0; i < 26; i++) { const x = s.x + r.range(-tw, tw); c.strokeStyle = rgba('#1a0f0a', r.range(0.2, 0.45)); c.lineWidth = r.range(1.5, 4); c.beginPath(); c.moveTo(x, top); for (let y = top; y < bot; y += 20) c.lineTo(x + Math.sin(y * 0.05 + i) * 4, y); c.stroke(); }
  for (let i = 0; i < 3; i++) { const kx = s.x + r.range(-tw * 0.3, tw * 0.3), ky = r.range(top + 60, bot - 40); c.fillStyle = '#2a1a10'; c.beginPath(); c.ellipse(kx, ky, 8, 12, 0, 0, TAU); c.fill(); c.strokeStyle = A.pal.bark; c.lineWidth = 2; c.beginPath(); c.ellipse(kx, ky, 11, 16, 0, 0, TAU); c.stroke(); }
  // moss on lit side
  for (let i = 0; i < 14; i++) { const y = r.range(top + 30, bot); const x = s.x + (L.x < 0 ? -1 : 1) * r.range(tw * 0.1, tw * 0.55); c.fillStyle = rgba(A.pal.moss, r.range(0.4, 0.75)); c.beginPath(); c.ellipse(x, y, r.range(6, 14), r.range(10, 24), 0, 0, TAU); c.fill(); }
  aoTop(c, s.x - tw * 2, s.x + tw * 2, top + 10, 70, '#0a0d08', 0.6);
  aoBottom(c, s.x - tw * 2, s.x + tw * 2, bot, 120, '#0a1408', 0.5);
  c.restore();
  trunk(); c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 3; c.stroke();
  // mushrooms on trunk
  for (let i = 0; i < 3; i++) { const mx = s.x + (i % 2 ? 1 : -1) * tw * 0.48, my = top + 80 + i * 55; c.fillStyle = '#f5e6c8'; c.fillRect(mx - 2, my, 4, 8); c.fillStyle = '#e8574a'; c.beginPath(); c.ellipse(mx, my, 11, 6, 0, Math.PI, 0); c.fill(); c.strokeStyle = rgba(A.pal.ink, 0.8); c.lineWidth = 2; c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(mx - 4, my - 3, 1.6, 0, TAU); c.arc(mx + 3, my - 4, 1.4, 0, TAU); c.fill(); }
  // wooden platform
  const px0 = s.x - w / 2, px1 = s.x + w / 2;
  for (let x = px0; x < px1; x += 16) { const v = r.range(-0.1, 0.1); c.fillStyle = shade(A.pal.plank, v); c.fillRect(x, top, 15, 12); c.fillStyle = rgba('#ffffff', 0.2); c.fillRect(x, top, 15, 2); c.fillStyle = '#2a1a10'; c.beginPath(); c.arc(x + 4, top + 6, 1.2, 0, TAU); c.arc(x + 11, top + 6, 1.2, 0, TAU); c.fill(); }
  c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 3; c.strokeRect(px0, top, w, 12);
  aoTop(c, px0, px1, top + 12, 18, '#000', 0.4);
  // support struts
  c.strokeStyle = A.pal.plank; c.lineWidth = 6; c.beginPath(); c.moveTo(px0 + 10, top + 12); c.lineTo(s.x - tw / 2 + 4, top + 60); c.moveTo(px1 - 10, top + 12); c.lineTo(s.x + tw / 2 - 4, top + 60); c.stroke();
  c.strokeStyle = rgba(A.pal.ink, 0.7); c.lineWidth = 1.5; c.stroke();
  // rope railing on outer side + lantern
  const out = s.side < 0 ? -1 : 1, ex = s.x + out * (w / 2 - 4);
  c.strokeStyle = '#3a2416'; c.lineWidth = 4; c.beginPath(); c.moveTo(ex, top); c.lineTo(ex, top - 40); c.stroke();
  c.strokeStyle = '#d9c08a'; c.lineWidth = 2; c.beginPath(); c.moveTo(ex, top - 36); c.quadraticCurveTo(ex - out * 30, top - 24, ex - out * 56, top - 34); c.stroke();
  c.strokeStyle = '#3a2416'; c.lineWidth = 4; c.beginPath(); c.moveTo(ex - out * 56, top); c.lineTo(ex - out * 56, top - 36); c.stroke();
  s.lantern = { x: ex + out * 6, y: top - 40 };
  // leafy tuft behind on outer side
  c.fillStyle = A.pal.leaf2; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(s.x + out * (w * 0.45 + r.range(0, 30)), top - r.range(0, 20), r.range(12, 20), 0, TAU); c.fill(); }
}

function paintMesa(c, s, A, r) {
  const L = A.light.L, w = s.w, top = s.top, bot = 60, n = fbm1(s.seed, 4);
  const path = () => { c.beginPath(); c.moveTo(s.x - w / 2, top); for (let y = top; y <= bot; y += 8) { const t = (y - top) / (bot - top); c.lineTo(s.x - w / 2 - t * w * 0.28 - n(y * 0.03) * 18 + (Math.floor(y / 40) % 2) * 6, y); } for (let y = bot; y >= top; y -= 8) { const t = (y - top) / (bot - top); c.lineTo(s.x + w / 2 + t * w * 0.28 + n(y * 0.03 + 50) * 18 - (Math.floor(y / 46) % 2) * 6, y); } c.closePath(); };
  path(); c.fillStyle = A.pal.sand1; c.fill();
  c.save(); path(); c.clip();
  // strata bands
  const bands = [A.pal.sand1, A.pal.sand2, A.pal.sand3, A.pal.sand2, A.pal.sand4];
  let y = top + 6, k = 0; while (y < bot) { const h = r.range(18, 44); c.fillStyle = bands[k % bands.length]; c.beginPath(); c.moveTo(s.x - w * 2, y); for (let x = s.x - w * 2; x < s.x + w * 2; x += 14) c.lineTo(x, y + Math.sin(x * 0.02 + k) * 3); c.lineTo(s.x + w * 2, y + h); c.lineTo(s.x - w * 2, y + h); c.fill(); c.fillStyle = rgba('#ffffff', 0.12); c.fillRect(s.x - w * 2, y, w * 4, 2); y += h; k++; }
  // vertical erosion grooves
  for (let i = 0; i < 18; i++) { const x = s.x + r.range(-w, w); c.strokeStyle = rgba('#5a2a14', r.range(0.12, 0.28)); c.lineWidth = r.range(2, 6); c.beginPath(); c.moveTo(x, top + r.range(10, 80)); c.lineTo(x + r.range(-6, 6), bot); c.stroke(); }
  speckle(c, r, s.x - w, top, w * 2, bot - top, 300, rgba('#3a1a0a', 0.15), 1, 3);
  bodyShade(c, s.x - w * 0.8, s.x + w * 0.8, top, bot + 40, L, '#fff2d0', A.pal.sandSh, 0.4);
  aoTop(c, s.x - w, s.x + w, top, 30, '#3a1a0a', 0.3);
  c.restore();
  path(); c.strokeStyle = rgba(A.pal.ink, 0.85); c.lineWidth = 3; c.stroke();
  // flat cap
  c.fillStyle = shade(A.pal.sand1, 0.15); c.beginPath(); roundRect(c, s.x - w / 2 - 6, top - 6, w + 12, 12, 5); c.fill(); c.stroke();
  // cactus on outer side
  const out = s.side < 0 ? -1 : 1, cx = s.x + out * (w / 2 - 20);
  const cac = (x, y, h) => { c.fillStyle = A.pal.cactus; c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 2.5; c.beginPath(); roundRect(c, x - 7, y - h, 14, h, 7); c.fill(); c.stroke();
    c.beginPath(); roundRect(c, x + 5, y - h * 0.62, 14, 8, 4); roundRect(c, x + 12, y - h * 0.85, 8, h * 0.3, 4); c.fill(); c.stroke();
    c.beginPath(); roundRect(c, x - 18, y - h * 0.45, 13, 7, 3.5); roundRect(c, x - 19, y - h * 0.68, 7, h * 0.28, 3.5); c.fill(); c.stroke();
    c.fillStyle = rgba('#ffffff', 0.25); c.fillRect(x - 4, y - h + 5, 2.5, h - 10); c.fillStyle = '#ff6fa8'; c.beginPath(); c.arc(x, y - h, 3.5, 0, TAU); c.fill(); };
  cac(cx, top - 4, 52);
  // skull rock
  c.fillStyle = '#efe6d2'; c.beginPath(); c.ellipse(s.x + out * (w / 2 - 50), top - 7, 7, 6, 0, 0, TAU); c.fill(); c.strokeStyle = rgba(A.pal.ink, 0.8); c.lineWidth = 1.8; c.stroke();
  c.fillStyle = '#3a2a20'; c.beginPath(); c.arc(s.x + out * (w / 2 - 50) - 2, top - 8, 1.4, 0, TAU); c.arc(s.x + out * (w / 2 - 50) + 2.5, top - 8, 1.4, 0, TAU); c.fill();
}

function paintIce(c, s, A, r) {
  const L = A.light.L, w = s.w, top = s.top, bot = 60, n = fbm1(s.seed, 4);
  const path = () => { c.beginPath(); c.moveTo(s.x - w / 2, top + 6); for (let y = top + 6; y <= bot; y += 9) { const t = (y - top) / (bot - top); c.lineTo(s.x - w / 2 - t * t * w * 0.3 - n(y * 0.025) * 22, y); } for (let y = bot; y >= top + 6; y -= 9) { const t = (y - top) / (bot - top); c.lineTo(s.x + w / 2 + t * t * w * 0.3 + n(y * 0.025 + 70) * 22, y); } c.closePath(); };
  path(); const g = c.createLinearGradient(0, top, 0, bot); g.addColorStop(0, A.pal.rock); g.addColorStop(1, A.pal.rock2); c.fillStyle = g; c.fill();
  c.save(); path(); c.clip();
  for (let i = 0; i < 12; i++) { const yy = r.range(top + 20, bot), xx = s.x + r.range(-w * 0.6, w * 0.6); c.fillStyle = rgba(r() < 0.5 ? '#bfe8ff' : '#000010', r.range(0.05, 0.12)); c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + r.range(15, 40), yy + r.range(10, 30)); c.lineTo(xx + r.range(0, 15), yy + r.range(40, 80)); c.lineTo(xx - r.range(10, 30), yy + r.range(20, 40)); c.fill(); }
  // ice crystal veins
  for (let i = 0; i < 5; i++) { const x = s.x + r.range(-w * 0.4, w * 0.4), y = r.range(top + 60, bot - 30); c.fillStyle = rgba('#8ff0ff', 0.55); c.beginPath(); c.moveTo(x, y - 18); c.lineTo(x + 7, y); c.lineTo(x, y + 14); c.lineTo(x - 6, y); c.fill(); glow(c, x, y, 30, '#7fe8ff', 0.2); }
  speckle(c, r, s.x - w, top, w * 2, bot - top, 180, rgba('#000020', 0.15), 1, 3);
  bodyShade(c, s.x - w * 0.9, s.x + w * 0.9, top, bot + 30, L, '#d8f4ff', '#050a20', 0.42);
  aoTop(c, s.x - w, s.x + w, top + 6, 40, '#050a20', 0.45);
  c.restore();
  path(); c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 3; c.stroke();
  // snow cap with overhang
  c.fillStyle = '#f4fbff'; c.beginPath(); c.moveTo(s.x - w / 2 - 10, top + 6);
  for (let x = s.x - w / 2 - 10; x <= s.x + w / 2 + 10; x += 8) c.lineTo(x, top - 3 - Math.sin(x * 0.12) * 2);
  c.lineTo(s.x + w / 2 + 10, top + 8); for (let x = s.x + w / 2 + 10; x >= s.x - w / 2 - 10; x -= 7) c.lineTo(x, top + 10 + Math.abs(Math.sin(x * 0.21)) * 9); c.closePath(); c.fill();
  c.strokeStyle = rgba(A.pal.ink, 0.6); c.lineWidth = 2; c.stroke();
  c.fillStyle = rgba('#9fc8ef', 0.6); c.fillRect(s.x - w / 2 - 4, top + 6, w + 8, 3);
  // icicles
  for (let x = s.x - w / 2; x < s.x + w / 2; x += r.range(8, 16)) { const h = r.range(8, 26); const ig = c.createLinearGradient(0, top + 10, 0, top + 10 + h); ig.addColorStop(0, '#e8fbff'); ig.addColorStop(1, rgba('#8fdcff', 0.6)); c.fillStyle = ig; c.beginPath(); c.moveTo(x - 3, top + 10); c.lineTo(x + 3, top + 10); c.lineTo(x, top + 10 + h); c.closePath(); c.fill(); }
  // small snowy pine on outer side
  const out = s.side < 0 ? -1 : 1; pine(c, s.x + out * (w / 2 - 16), top, 46, '#1f4a5a', '#f4fbff');
}

// mid obstacles
function paintMid(c, m, A, r) {
  const t = A.midKind, x = m.x, top = m.top, w = m.w;
  c.save();
  if (t === 'spire') { // rock spire (cliffs / mesa / frost)
    const col = A.pal.midCol || A.pal.rock;
    c.beginPath(); c.moveTo(x - w / 2, top + 12); c.quadraticCurveTo(x, top - 14, x + w / 2, top + 12); c.lineTo(x + w * 0.9, 60); c.lineTo(x - w * 0.9, 60); c.closePath();
    const g = c.createLinearGradient(x - w, 0, x + w, 0); g.addColorStop(0, shade(col, A.light.L.x < 0 ? 0.15 : -0.3)); g.addColorStop(1, shade(col, A.light.L.x < 0 ? -0.3 : 0.15)); c.fillStyle = g; c.fill();
    c.save(); c.clip(); for (let y = top + 20; y < 60; y += r.range(14, 28)) { c.strokeStyle = rgba('#000000', 0.18); c.lineWidth = 2; c.beginPath(); c.moveTo(x - w, y); c.lineTo(x + w, y + r.range(-4, 4)); c.stroke(); } speckle(c, r, x - w, top, w * 2, 60 - top, 120, rgba('#000', 0.15), 1, 3); aoBottom(c, x - w, x + w, 60, 120, '#000', 0.5); c.restore();
    c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 3; c.stroke();
    if (A.id === 'frost') { c.fillStyle = '#f4fbff'; c.beginPath(); c.ellipse(x, top + 4, w * 0.55, 10, 0, Math.PI, 0); c.fill(); }
    if (A.id === 'cliffs') grassTop(c, r, x - w * 0.35, x + w * 0.35, top + 2, A.pal.grass, A.pal.grass2, null);
  } else if (t === 'gate') { // castle gatehouse tower
    const s = { x, top, w, side: 0, seed: 3 }; c.fillStyle = A.pal.stone; c.fillRect(x - w / 2, top, w, 60 - top);
    c.save(); c.beginPath(); c.rect(x - w / 2, top, w, 60 - top); c.clip();
    for (let y = top, row = 0; y < 60; y += 16, row++) for (let xx = x - w / 2 - (row % 2) * 17; xx < x + w / 2; xx += 34) { c.fillStyle = shade(A.pal.stone, r.range(-0.1, 0.06)); c.fillRect(xx + 1.5, y + 1.5, 31, 13); }
    bodyShade(c, x - w / 2, x + w / 2, top, 60, A.light.L, A.pal.stoneHi, A.pal.stoneSh, 0.4); aoBottom(c, x - w, x + w, 60, 160, A.pal.stoneSh, 0.7); c.restore();
    c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 3; c.strokeRect(x - w / 2, top, w, 70);
    for (let i = 0; i < 3; i++) { const mx = x - w / 2 + 8 + i * (w - 16) / 2; c.fillStyle = shade(A.pal.stone, 0.08); c.beginPath(); roundRect(c, mx - 9, top - 20, 18, 22, 3); c.fill(); c.stroke(); }
    // pointed roof flag
    c.strokeStyle = '#2a1e1a'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, top - 20); c.lineTo(x, top - 70); c.stroke();
    m.flag = { x, y: top - 70 };
  } else if (t === 'tree') {
    const n = fbm1(7, 3);
    c.beginPath(); c.moveTo(x - w * 0.4, 60); for (let y = 60; y > top; y -= 10) c.lineTo(x - w * 0.3 - n(y * 0.02) * 8 + (y - top) * 0.04, y); c.lineTo(x - w * 0.6, top - 30); c.lineTo(x - w * 0.15, top + 6); c.lineTo(x + w * 0.1, top - 40); c.lineTo(x + w * 0.3, top + 4); for (let y = top; y < 60; y += 10) c.lineTo(x + w * 0.3 + n(y * 0.02 + 5) * 8 - (y - top) * 0.04 + (y > 0 ? 20 : 0), y); c.closePath();
    const g = c.createLinearGradient(x - w, 0, x + w, 0); g.addColorStop(0, A.pal.bark2); g.addColorStop(0.5, A.pal.bark); g.addColorStop(1, A.pal.bark2); c.fillStyle = g; c.fill();
    c.save(); c.clip(); for (let i = 0; i < 12; i++) { const xx = x + r.range(-w * 0.4, w * 0.4); c.strokeStyle = rgba('#1a0f0a', 0.35); c.lineWidth = r.range(1.5, 3); c.beginPath(); c.moveTo(xx, top - 30); c.lineTo(xx + r.range(-5, 5), 60); c.stroke(); } aoBottom(c, x - w, x + w, 60, 100, '#0a1408', 0.5); c.restore();
    c.strokeStyle = rgba(A.pal.ink, 0.9); c.lineWidth = 3; c.stroke();
    for (let i = 0; i < 6; i++) { c.fillStyle = rgba(A.pal.moss, 0.7); c.beginPath(); c.ellipse(x + r.range(-w * 0.25, w * 0.25), r.range(top + 20, 0), 8, 14, 0, 0, TAU); c.fill(); }
  } else if (t === 'billboard') {
    c.strokeStyle = '#141226'; c.lineWidth = 7; c.beginPath(); c.moveTo(x - w * 0.3, 60); c.lineTo(x - w * 0.3, top + 60); c.moveTo(x + w * 0.3, 60); c.lineTo(x + w * 0.3, top + 60); c.stroke();
    c.lineWidth = 3; for (let y = top + 80; y < 40; y += 50) { c.beginPath(); c.moveTo(x - w * 0.3, y); c.lineTo(x + w * 0.3, y + 50); c.moveTo(x + w * 0.3, y); c.lineTo(x - w * 0.3, y + 50); c.stroke(); }
    const bw = w * 1.5, bh = 66; c.fillStyle = '#1d1838'; c.beginPath(); roundRect(c, x - bw / 2, top, bw, bh, 6); c.fill(); c.strokeStyle = '#0a0818'; c.lineWidth = 4; c.stroke();
    m.sign = { x, y: top + bh / 2, w: bw, h: bh };
  }
  c.restore();
}

// ---------------- ground painters (p=1 layer) ----------------
function groundSea(c, e, A, r) {
  const g = c.createLinearGradient(0, -10, 0, 500); g.addColorStop(0, A.pal.sea1); g.addColorStop(0.4, A.pal.sea2); g.addColorStop(1, A.pal.sea3);
  c.fillStyle = g; c.fillRect(e.x0, 0, e.x1 - e.x0, e.y1);
  for (let i = 0; i < (e.x1 - e.x0) / 18; i++) { const x = r.range(e.x0, e.x1), y = r.range(8, 300); c.fillStyle = rgba('#ffffff', r.range(0.08, 0.25) * (1 - y / 320)); c.fillRect(x, y, r.range(10, 40) * (1 - y / 400), 2); }
  c.fillStyle = rgba('#ffffff', 0.55); c.fillRect(e.x0, -2, e.x1 - e.x0, 4);
}
function groundMoat(c, e, A, r) {
  const g = c.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, A.pal.water1); g.addColorStop(1, A.pal.water2); c.fillStyle = g; c.fillRect(e.x0, 10, e.x1 - e.x0, e.y1);
  for (let i = 0; i < (e.x1 - e.x0) / 14; i++) { const x = r.range(e.x0, e.x1), y = r.range(16, 260); c.fillStyle = rgba(r() < 0.3 ? '#ffd38a' : '#c8d8ff', r.range(0.06, 0.18) * (1 - y / 280)); c.fillRect(x, y, r.range(8, 30), 2); }
  c.fillStyle = A.pal.bank; c.fillRect(e.x0, -6, e.x1 - e.x0, 18); c.fillStyle = rgba('#ffffff', 0.15); c.fillRect(e.x0, -6, e.x1 - e.x0, 3);
}
function groundStreet(c, e, A, r) {
  const g = c.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, '#1a1730'); g.addColorStop(1, '#07060f'); c.fillStyle = g; c.fillRect(e.x0, 0, e.x1 - e.x0, e.y1);
  // neon reflections streaks
  for (let i = 0; i < (e.x1 - e.x0) / 26; i++) { const x = r.range(e.x0, e.x1), col = r.pick(['#ff3fa4', '#3ff4ff', '#ffd36e', '#9b6bff']); const gg = c.createLinearGradient(0, 4, 0, 120); gg.addColorStop(0, rgba(col, r.range(0.15, 0.4))); gg.addColorStop(1, rgba(col, 0)); c.fillStyle = gg; c.fillRect(x, 4, r.range(3, 12), r.range(40, 120)); }
  c.fillStyle = '#2e2a4a'; c.fillRect(e.x0, -4, e.x1 - e.x0, 8);
  for (let x = e.x0; x < e.x1; x += 60) { c.fillStyle = rgba('#ffd36e', 0.5); c.fillRect(x, 40, 30, 3); }
}
function groundForest(c, e, A, r) {
  const g = c.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, A.pal.floor1); g.addColorStop(1, A.pal.floor2); c.fillStyle = g; c.fillRect(e.x0, 0, e.x1 - e.x0, e.y1);
  for (let i = 0; i < (e.x1 - e.x0) / 12; i++) { const x = r.range(e.x0, e.x1); c.strokeStyle = r.pick([A.pal.leaf, A.pal.leaf2, A.pal.moss]); c.lineWidth = 2.5; c.beginPath(); c.moveTo(x, 6); c.quadraticCurveTo(x + r.range(-10, 10), -10, x + r.range(-16, 16), -r.range(10, 28)); c.stroke(); }
  for (let i = 0; i < (e.x1 - e.x0) / 120; i++) { const x = r.range(e.x0, e.x1); c.fillStyle = A.pal.leaf2; for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(x + k * 8 - 12, -6, 14, 6, (k - 1.5) * 0.4, 0, TAU); c.fill(); } }
}
function groundSand(c, e, A, r) {
  const g = c.createLinearGradient(0, -20, 0, 300); g.addColorStop(0, A.pal.dune1); g.addColorStop(1, A.pal.dune2); c.fillStyle = g;
  c.beginPath(); c.moveTo(e.x0, e.y1); for (let x = e.x0; x <= e.x1; x += 20) c.lineTo(x, -4 + Math.sin(x * 0.006) * 10); c.lineTo(e.x1, e.y1); c.fill();
  for (let i = 0; i < (e.x1 - e.x0) / 30; i++) { const x = r.range(e.x0, e.x1), y = r.range(10, 200); c.strokeStyle = rgba('#a8642c', 0.25); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 20, y - 4, x + 40, y); c.stroke(); }
  for (let i = 0; i < (e.x1 - e.x0) / 200; i++) { const x = r.range(e.x0, e.x1); c.fillStyle = '#9a6a4a'; c.beginPath(); c.ellipse(x, 2, r.range(8, 20), r.range(5, 10), 0, Math.PI, 0); c.fill(); }
}
function groundSnow(c, e, A, r) {
  const g = c.createLinearGradient(0, -10, 0, 300); g.addColorStop(0, '#eaf6ff'); g.addColorStop(1, '#9cc0e0'); c.fillStyle = g;
  c.beginPath(); c.moveTo(e.x0, e.y1); for (let x = e.x0; x <= e.x1; x += 20) c.lineTo(x, -6 + Math.sin(x * 0.008) * 8 + Math.sin(x * 0.03) * 3); c.lineTo(e.x1, e.y1); c.fill();
  for (let i = 0; i < (e.x1 - e.x0) / 40; i++) { const x = r.range(e.x0, e.x1), y = r.range(10, 150); c.fillStyle = rgba('#6f9cc8', 0.25); c.beginPath(); c.ellipse(x, y, r.range(20, 60), r.range(3, 7), 0, 0, TAU); c.fill(); }
  speckle(c, r, e.x0, 0, e.x1 - e.x0, 200, (e.x1 - e.x0) / 6, rgba('#ffffff', 0.8), 1, 2);
}

// ---------------- arena definitions ----------------
export const ARENAS = {
  cliffs: {
    id: 'cliffs', name: 'Gull Point', sky: [[0, '#2c2560'], [0.45, '#b04e7c'], [0.78, '#ff8f6b'], [1, '#ffd08a']],
    sun: { x: 0.68, y: 0.62, r: 34, col: '#fff1c4', glow: '#ffb070', glowR: 380 },
    light: { L: { x: 0.55, y: -0.84 }, amb: '#ffd9c0', ambAmt: 0.22, shadow: '#5b2a6e', shadowAmt: 0.42, rim: '#ffc27a', rimAmt: 0.75, outline: '#2a1430' },
    fog: '#ff9a7a', weather: 'motes', birds: 'gulls', grade: ['#ff7a5a', '#4a2a7a'],
    pal: { rock: '#b0607a', rock2: '#5e2f5a', rockLine: '#4a1f45', rockHi: '#ffd2a0', rockSh: '#2a1235', ink: '#2a1430', grass: '#6fbf5a', grass2: '#3f8a46', flowers: ['#ffd84a', '#ff7aa8', '#ffffff'], sea1: '#ff9f86', sea2: '#8a4f8f', sea3: '#3a2560', midCol: '#8a4a6a' },
    struct: paintCliff, ground: groundSea, midKind: 'spire', heights: [170, 320],
    layers: [
      { p: 0.04, paint(c, e, A, r) { // distant sea + horizon islands
        const hy = -90; const g = c.createLinearGradient(0, hy, 0, hy + 500); g.addColorStop(0, '#ffb487'); g.addColorStop(0.15, '#d77a8c'); g.addColorStop(1, '#4a2a6a'); c.fillStyle = g; c.fillRect(e.x0, hy, e.x1 - e.x0, e.y1 - hy);
        ridge(c, e, { seed: 11, base: hy + 2, amp: 40, freq: 0.006, color: '#c46f8f' });
        c.fillStyle = '#ffb487'; c.fillRect(e.x0, hy, e.x1 - e.x0, 3);
      } },
      { p: 0.12, paint(c, e, A, r) { // sun glitter path on sea (painted with sun x approx at screen center-right)
        const hy = -60; for (let i = 0; i < (e.x1 - e.x0) / 6; i++) { const x = r.range(e.x0, e.x1), y = r.range(hy, hy + 260); c.fillStyle = rgba('#fff0c0', r.range(0.05, 0.3) * (1 - (y - hy) / 280)); c.fillRect(x, y, r.range(6, 26), 1.6); }
      } },
      { p: 0.22, paint(c, e, A, r) { // far headland with lighthouse
        const n = ridge(c, e, { seed: 21, base: -40, amp: 210, freq: 0.0022, color: '#7d4a7e', grad: '#5a3266', gradH: 160, rim: rgba('#ffb38a', 0.8), rimW: 4 });
        const lx = e.x0 + (e.x1 - e.x0) * 0.78; const ly = -40 - n(lx * 0.0022) * 210;
        c.fillStyle = '#f2e6f0'; c.beginPath(); c.moveTo(lx - 12, ly + 4); c.lineTo(lx - 8, ly - 70); c.lineTo(lx + 8, ly - 70); c.lineTo(lx + 12, ly + 4); c.fill();
        c.fillStyle = '#d8434e'; c.fillRect(lx - 10, ly - 30, 20, 12); c.fillRect(lx - 9, ly - 58, 18, 10);
        c.fillStyle = '#3a2a40'; c.fillRect(lx - 10, ly - 82, 20, 12); c.fillStyle = '#fff6b0'; c.fillRect(lx - 6, ly - 80, 12, 8);
        glow(c, lx, ly - 76, 70, '#fff3a0', 0.5);
        haze(c, e, -260, 40, A.fog, 0, 0.35);
      } },
      { p: 0.45, paint(c, e, A, r) { // sea stacks
        for (let i = 0; i < 7; i++) { const x = r.range(e.x0, e.x1), h = r.range(60, 160), w = r.range(30, 70); c.fillStyle = '#6a3a6a'; c.beginPath(); c.moveTo(x - w, 10); c.lineTo(x - w * 0.6, -h); c.quadraticCurveTo(x, -h - 14, x + w * 0.6, -h); c.lineTo(x + w, 10); c.fill(); c.fillStyle = rgba('#ffb38a', 0.35); c.beginPath(); c.moveTo(x + w * 0.6, -h); c.lineTo(x + w, 10); c.lineTo(x + w * 0.75, 10); c.lineTo(x + w * 0.45, -h + 6); c.fill(); c.fillStyle = '#5fa85a'; c.beginPath(); c.ellipse(x, -h - 4, w * 0.6, 8, 0, Math.PI, 0); c.fill(); }
        haze(c, e, -200, 30, A.fog, 0, 0.3);
      } },
    ],
  },
  castle: {
    id: 'castle', name: 'Kingsgate Walls', sky: [[0, '#141a46'], [0.5, '#3f3f8a'], [0.82, '#b06a96'], [1, '#ffb08a']],
    moon: { x: 0.22, y: 0.2, r: 28, col: '#fff8e6', glow: '#b9c4ff', glowR: 220 }, stars: true,
    light: { L: { x: -0.6, y: -0.8 }, amb: '#c9c8ff', ambAmt: 0.3, shadow: '#2a2a6a', shadowAmt: 0.45, rim: '#bcd2ff', rimAmt: 0.7, outline: '#1a1430' },
    fog: '#7a6aa8', weather: 'snow', birds: 'bats', grade: ['#ff9a7a', '#1a1a5a'],
    pal: { stone: '#8a8aa8', stone2: '#6a6a8a', stoneHi: '#d8dcff', stoneSh: '#1a1838', moss: '#5a8a5a', ink: '#1a1430', bannerL: '#2f6fd6', bannerR: '#d63a3a', water1: '#3a3a7a', water2: '#141436', bank: '#3f6a4a' },
    struct: paintTower, ground: groundMoat, midKind: 'gate', heights: [210, 340],
    layers: [
      { p: 0.04, paint(c, e, A, r) { ridge(c, e, { seed: 31, base: -60, amp: 320, freq: 0.0016, color: '#5a5aa0', grad: '#7a6aa8', gradH: 260, snow: '#d8dcff', rim: rgba('#e8ecff', 0.7) }); haze(c, e, -300, 60, '#9a8ac0', 0, 0.55); } },
      { p: 0.15, paint(c, e, A, r) { // distant castle on hill
        const n = ridge(c, e, { seed: 41, base: -20, amp: 120, freq: 0.002, color: '#3e3e78', grad: '#4a4a86', gradH: 120 });
        const cx = e.x0 + (e.x1 - e.x0) * 0.3, cy = -20 - n(cx * 0.002) * 120;
        c.fillStyle = '#34346a';
        const tw = (x, y, w, h) => { c.fillRect(x - w / 2, y - h, w, h); c.beginPath(); c.moveTo(x - w / 2 - 4, y - h); c.lineTo(x, y - h - w * 1.1); c.lineTo(x + w / 2 + 4, y - h); c.fill(); };
        tw(cx, cy + 10, 26, 110); tw(cx - 50, cy + 10, 20, 80); tw(cx + 48, cy + 10, 22, 90); c.fillRect(cx - 60, cy - 40, 120, 50); tw(cx + 90, cy + 14, 16, 60);
        for (let i = 0; i < 14; i++) { c.fillStyle = r() < 0.7 ? '#ffd38a' : '#ff9a4a'; c.fillRect(cx + r.range(-60, 95), cy + r.range(-95, 0), 3, 5); }
        haze(c, e, -200, 40, A.fog, 0, 0.45);
      } },
      { p: 0.35, paint(c, e, A, r) { // village + pines
        for (let x = e.x0; x < e.x1; x += r.range(14, 30)) pine(c, x, 10, r.range(50, 110), '#26305a', rgba('#cfd8ff', 0.6));
        for (let i = 0; i < (e.x1 - e.x0) / 160; i++) { const x = r.range(e.x0, e.x1), w = r.range(40, 70), h = r.range(30, 50); c.fillStyle = '#2e2a52'; c.fillRect(x, -h, w, h + 10); c.fillStyle = '#4a2a4a'; c.beginPath(); c.moveTo(x - 6, -h); c.lineTo(x + w / 2, -h - 28); c.lineTo(x + w + 6, -h); c.fill(); c.fillStyle = '#ffcf7a'; c.fillRect(x + 8, -h + 10, 7, 9); c.fillRect(x + w - 16, -h + 10, 7, 9); glow(c, x + w / 2, -h + 15, 40, '#ffb347', 0.2); }
        haze(c, e, -120, 20, A.fog, 0, 0.4);
      } },
    ],
  },
  neon: {
    id: 'neon', name: 'Neon Alley', sky: [[0, '#070a22'], [0.55, '#241446'], [0.85, '#5a1e5e'], [1, '#a83a7a']],
    stars: false, cityGlow: '#ff4fa8',
    light: { L: { x: 0.6, y: -0.8 }, amb: '#b8a8ff', ambAmt: 0.42, shadow: '#1a1050', shadowAmt: 0.5, rim: '#5ff0ff', rimAmt: 0.85, outline: '#0e0820' },
    fog: '#5a2a7a', weather: 'rain', birds: null, grade: ['#ff3fa4', '#0a1a4a'],
    pal: { wallL: '#4a3a6a', wallR: '#3a4a6e', wallHi: '#ff7ad0', ink: '#0e0820' },
    struct: paintBuilding, ground: groundStreet, midKind: 'billboard', heights: [200, 340],
    layers: [
      { p: 0.05, paint(c, e, A, r) { for (let x = e.x0; x < e.x1; x += r.range(30, 70)) { const h = r.range(120, 380), w = r.range(30, 70); c.fillStyle = '#1a1840'; c.fillRect(x, -h, w, h + 300); for (let k = 0; k < h / 12; k++) if (r() < 0.25) { c.fillStyle = rgba(r.pick(['#ffd36e', '#7fe8ff', '#ff8fd0']), 0.6); c.fillRect(x + r.range(3, w - 6), -h + k * 12, 3, 4); } } haze(c, e, -260, 80, '#7a2a7a', 0, 0.6); } },
      { p: 0.2, paint(c, e, A, r) {
        for (let x = e.x0; x < e.x1; x += r.range(60, 120)) { const h = r.range(140, 320), w = r.range(50, 100); c.fillStyle = '#211b48'; c.fillRect(x, -h, w, h + 300); c.fillStyle = rgba('#ff7ad0', 0.25); c.fillRect(x + w - 3, -h, 3, h);
          for (let yy = -h + 12; yy < 0; yy += 16) for (let xx = x + 6; xx < x + w - 8; xx += 12) if (r() < 0.32) { c.fillStyle = r.pick(['#ffd36e', '#9ff0ff', '#ffa0d8', '#ffe9b0']); c.fillRect(xx, yy, 6, 8); }
          if (r() < 0.35) { const sc = r.pick(['#ff3fa4', '#3ff4ff', '#ffe14a', '#9b6bff']); c.save(); c.shadowColor = sc; c.shadowBlur = 18; c.strokeStyle = sc; c.lineWidth = 3; c.beginPath(); roundRect(c, x + 8, -h + 20, w - 16, 26, 6); c.stroke(); c.restore(); }
          if (r() < 0.3) { c.strokeStyle = '#141030'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + w / 2, -h); c.lineTo(x + w / 2, -h - 40); c.stroke(); } }
        haze(c, e, -200, 60, '#6a2a8a', 0, 0.45);
      } },
      { p: 0.42, paint(c, e, A, r) {
        for (let x = e.x0; x < e.x1; x += r.range(110, 190)) { const h = r.range(100, 240), w = r.range(80, 140); c.fillStyle = '#16122e'; c.fillRect(x, -h, w, h + 300);
          for (let yy = -h + 16; yy < 0; yy += 22) for (let xx = x + 8; xx < x + w - 14; xx += 18) { c.fillStyle = r() < 0.35 ? r.pick(['#ffcf7a', '#8fe8ff', '#ff9ad5']) : '#221c44'; c.fillRect(xx, yy, 10, 13); }
          const sc = r.pick(['#ff3fa4', '#3ff4ff', '#ffe14a', '#9bff6b']); c.save(); c.shadowColor = sc; c.shadowBlur = 24; c.fillStyle = sc; c.font = '900 26px "Russo One"'; c.textAlign = 'center'; c.fillText(r.pick(['RAMEN', 'HOTEL', 'BAR', 'ARCADE', 'NOODLE', '24H', 'TACO']), x + w / 2, -h + 34); c.restore(); }
        haze(c, e, -140, 40, '#4a1a6a', 0, 0.5);
      } },
    ],
  },
  forest: {
    id: 'forest', name: 'Mossy Hollow', sky: [[0, '#5fa8a0'], [0.5, '#a8d8b8'], [0.85, '#e8f0c0'], [1, '#fff4c8']],
    sun: { x: 0.8, y: 0.12, r: 26, col: '#fffbe0', glow: '#fff2a8', glowR: 420 }, rays: true,
    light: { L: { x: 0.5, y: -0.86 }, amb: '#e8ffd8', ambAmt: 0.12, shadow: '#1f4a4a', shadowAmt: 0.4, rim: '#fff4b0', rimAmt: 0.75, outline: '#14201a' },
    fog: '#d8ecc8', weather: 'leaves', birds: null, grade: ['#fff2a0', '#1a4a3a'],
    pal: { bark: '#7a5236', bark2: '#3e2a1c', moss: '#6aa84a', plank: '#b07a48', leaf: '#5aa84a', leaf2: '#3a7a3a', ink: '#14201a', floor1: '#3a5a2a', floor2: '#16240f' },
    struct: paintTreeTower, ground: groundForest, midKind: 'tree', heights: [180, 330],
    layers: [
      { p: 0.05, paint(c, e, A, r) { for (let x = e.x0; x < e.x1; x += r.range(18, 40)) pine(c, x, 40, r.range(150, 300), '#9ccab0'); haze(c, e, -320, 60, '#d8ecc8', 0.2, 0.7); } },
      { p: 0.18, paint(c, e, A, r) { for (let x = e.x0; x < e.x1; x += r.range(24, 50)) { if (r() < 0.5) pine(c, x, 40, r.range(180, 320), '#5f9a80'); else roundTree(c, x, 40, r.range(160, 260), '#6aa880', '#4a7060'); } haze(c, e, -260, 60, '#cfe8c0', 0, 0.55); } },
      { p: 0.38, paint(c, e, A, r) {
        for (let x = e.x0; x < e.x1; x += r.range(90, 170)) { const w = r.range(30, 60); const g = c.createLinearGradient(x - w, 0, x + w, 0); g.addColorStop(0, '#2c4a3a'); g.addColorStop(0.5, '#3e6a50'); g.addColorStop(1, '#22382e'); c.fillStyle = g; c.beginPath(); c.moveTo(x - w * 1.6, 40); c.quadraticCurveTo(x - w * 0.6, 0, x - w * 0.5, -400); c.lineTo(x + w * 0.5, -400); c.quadraticCurveTo(x + w * 0.6, 0, x + w * 1.6, 40); c.fill();
          c.fillStyle = '#2e5a3a'; for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(x + r.range(-90, 90), -400 + r.range(-40, 60), r.range(40, 80), 0, TAU); c.fill(); } }
        haze(c, e, -200, 40, '#d8ecc8', 0, 0.45);
      } },
    ],
  },
  mesa: {
    id: 'mesa', name: 'Sunscorch Mesa', sky: [[0, '#2f6fc8'], [0.5, '#7fb8ea'], [0.85, '#ffd9a8'], [1, '#ffc48a']],
    sun: { x: 0.78, y: 0.2, r: 30, col: '#fffbe8', glow: '#ffe2a0', glowR: 360 },
    light: { L: { x: 0.62, y: -0.78 }, amb: '#fff0d8', ambAmt: 0.1, shadow: '#7a3a5a', shadowAmt: 0.38, rim: '#fff0b8', rimAmt: 0.75, outline: '#3a1a10' },
    fog: '#ffd2a0', weather: 'dust', birds: 'vultures', grade: ['#ffd27a', '#7a3a2a'],
    pal: { sand1: '#e8945a', sand2: '#d07040', sand3: '#f2b878', sand4: '#b85a34', sandSh: '#5a2030', ink: '#3a1a10', cactus: '#4f9a5a', dune1: '#f2b878', dune2: '#c8784a', midCol: '#c8683a' },
    struct: paintMesa, ground: groundSand, midKind: 'spire', heights: [170, 320],
    layers: [
      { p: 0.04, paint(c, e, A, r) { for (let x = e.x0; x < e.x1; x += r.range(160, 320)) { const w = r.range(100, 260), h = r.range(60, 150); c.fillStyle = '#f0b090'; c.beginPath(); c.moveTo(x - w * 0.7, 20); c.lineTo(x - w * 0.45, -h); c.lineTo(x + w * 0.45, -h); c.lineTo(x + w * 0.7, 20); c.fill(); c.fillStyle = rgba('#fff0d0', 0.4); c.fillRect(x - w * 0.45, -h, w * 0.9, 4); } haze(c, e, -200, 40, '#ffd8b0', 0.2, 0.7); } },
      { p: 0.16, paint(c, e, A, r) { for (let x = e.x0; x < e.x1; x += r.range(180, 300)) { const w = r.range(120, 220), h = r.range(110, 210); c.fillStyle = '#d88058'; c.beginPath(); c.moveTo(x - w * 0.7, 30); c.lineTo(x - w * 0.42, -h + 10); c.lineTo(x - w * 0.36, -h); c.lineTo(x + w * 0.4, -h); c.lineTo(x + w * 0.46, -h + 14); c.lineTo(x + w * 0.7, 30); c.fill(); c.fillStyle = rgba('#7a3a4a', 0.35); c.beginPath(); c.moveTo(x + w * 0.1, -h); c.lineTo(x + w * 0.4, -h); c.lineTo(x + w * 0.7, 30); c.lineTo(x + w * 0.2, 30); c.fill(); for (let k = 1; k < 5; k++) { c.fillStyle = rgba('#fff0d0', 0.15); c.fillRect(x - w * 0.5, -h + k * h / 5, w, 3); } } haze(c, e, -200, 40, '#ffc8a0', 0, 0.5); } },
      { p: 0.4, paint(c, e, A, r) { for (let x = e.x0; x < e.x1; x += r.range(60, 140)) { const h = r.range(30, 70); c.fillStyle = '#7a4a3a'; c.fillRect(x - 5, -h, 10, h + 20); c.fillRect(x + 5, -h * 0.6, 12, 7); c.fillRect(x + 12, -h * 0.85, 6, h * 0.3); c.fillRect(x - 15, -h * 0.4, 10, 6); c.fillRect(x - 16, -h * 0.6, 5, h * 0.22); }
        for (let i = 0; i < (e.x1 - e.x0) / 100; i++) { const x = r.range(e.x0, e.x1); c.fillStyle = '#a05a3a'; c.beginPath(); c.ellipse(x, 14, r.range(30, 80), r.range(14, 30), 0, Math.PI, 0); c.fill(); }
        haze(c, e, -100, 30, '#ffc8a0', 0, 0.35); } },
    ],
  },
  frost: {
    id: 'frost', name: 'Frostpeak', sky: [[0, '#040b26'], [0.5, '#0f2a5a'], [0.85, '#1f5a7f'], [1, '#3f8a9f']],
    moon: { x: 0.8, y: 0.16, r: 22, col: '#f0fbff', glow: '#9fdcff', glowR: 200 }, stars: true, aurora: true,
    light: { L: { x: 0.55, y: -0.83 }, amb: '#bfe8ff', ambAmt: 0.32, shadow: '#1a2a6a', shadowAmt: 0.45, rim: '#8affd8', rimAmt: 0.75, outline: '#0a1430' },
    fog: '#4a8aaa', weather: 'snow', birds: null, grade: ['#8affd0', '#0a1a4a'],
    pal: { rock: '#4a5a7a', rock2: '#1f2a4a', ink: '#0a1430', midCol: '#3a4a6a' },
    struct: paintIce, ground: groundSnow, midKind: 'spire', heights: [180, 330],
    layers: [
      { p: 0.04, paint(c, e, A, r) { ridge(c, e, { seed: 61, base: -40, amp: 340, freq: 0.0022, color: '#2a4a7a', grad: '#3a6a8a', gradH: 300, snow: '#cfe8ff', rim: rgba('#aaffe8', 0.6), step: 6, oct: 6 }); haze(c, e, -300, 60, '#4a8aaa', 0, 0.55); } },
      { p: 0.16, paint(c, e, A, r) { ridge(c, e, { seed: 71, base: 0, amp: 200, freq: 0.003, color: '#1f3a62', grad: '#2a5a7a', gradH: 200, snow: '#e0f2ff', step: 6, oct: 6 }); haze(c, e, -200, 40, '#4a8aaa', 0, 0.45); } },
      { p: 0.38, paint(c, e, A, r) { for (let x = e.x0; x < e.x1; x += r.range(12, 26)) pine(c, x, 20, r.range(60, 130), '#123048', '#dff0ff'); haze(c, e, -130, 30, '#4a8aaa', 0, 0.4); } },
    ],
  },
};

// build structure sprite canvas for a platform
export function buildStructure(A, s, res) {
  const pad = s.w * 0.9 + 60, topPad = 140, bot = 80;
  const x0 = s.x - s.w / 2 - pad, x1 = s.x + s.w / 2 + pad, y0 = s.top - topPad, y1 = bot;
  const cv = makeCanvas((x1 - x0) * res, (y1 - y0) * res), c = cv.getContext('2d');
  c.setTransform(res, 0, 0, res, -x0 * res, -y0 * res); c.lineJoin = 'round';
  const r = mulberry(s.seed);
  A.struct(c, s, A, r);
  return { cv, x0, y0, w: x1 - x0, h: y1 - y0 };
}
export function buildMid(A, m, res) {
  const pad = m.w * 1.4 + 60, x0 = m.x - pad, x1 = m.x + pad, y0 = m.top - 120, y1 = 80;
  const cv = makeCanvas((x1 - x0) * res, (y1 - y0) * res), c = cv.getContext('2d');
  c.setTransform(res, 0, 0, res, -x0 * res, -y0 * res); c.lineJoin = 'round';
  paintMid(c, m, A, mulberry(m.seed || 5));
  return { cv, x0, y0, w: x1 - x0, h: y1 - y0 };
}
export function buildLayer(A, layer, e, res, seed) {
  const cv = makeCanvas((e.x1 - e.x0) * res, (e.y1 - e.y0) * res), c = cv.getContext('2d');
  c.setTransform(res, 0, 0, res, -e.x0 * res, -e.y0 * res); c.lineJoin = 'round';
  (layer.paint || layer)(c, e, A, mulberry(seed));
  return cv;
}
export { glow };
