// Additive glow sprites (fake bloom). Points are queued during drawing, flushed once per pass.
const Q = []; let n = 0;
const cache = new Map();
export function glowPush(x, y, r, a, col = null) {
  let e = Q[n]; if (!e) e = Q[n] = { x: 0, y: 0, r: 0, a: 0, col: null };
  e.x = x; e.y = y; e.r = r; e.a = a; e.col = col; n++;
}
export function glowSprite(col) {
  const key = ((col[0] >> 3) << 10) | ((col[1] >> 3) << 5) | (col[2] >> 3);
  let cv = cache.get(key);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const c = `${col[0] | 0},${col[1] | 0},${col[2] | 0}`;
    rg.addColorStop(0, `rgba(255,255,255,1)`); rg.addColorStop(0.12, `rgba(${c},0.9)`); rg.addColorStop(0.35, `rgba(${c},0.32)`); rg.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64); cache.set(key, cv);
  }
  return cv;
}
// flush queued glows; s = px per unit; defCol = default colour
export function glowFlush(c, s, defCol) {
  if (!n) return;
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const e = Q[i]; const spr = glowSprite(e.col || defCol); const r = e.r * s * 2.2;
    c.globalAlpha = Math.min(1, e.a); c.drawImage(spr, e.x * s - r, e.y * s - r, r * 2, r * 2);
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; n = 0;
}
export function glowClear() { n = 0; }
