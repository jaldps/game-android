// Small math / RNG / noise helpers (no allocations in hot paths).
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// integer hash -> [0,1)
export function hash1(n, seed = 0) {
  let h = (n | 0) * 374761393 + (seed | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
// smooth 1D value noise in [0,1]
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i, seed) * (1 - u) + hash1(i + 1, seed) * u;
}
export function fbm1(x, seed = 0, oct = 3) {
  let a = 0.5, s = 0, n = 0, f = 1;
  for (let o = 0; o < oct; o++) { s += noise1(x * f, seed + o * 17) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
// 2D value noise for swirl fields
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash1(ix + iy * 57, seed), b = hash1(ix + 1 + iy * 57, seed);
  const c = hash1(ix + (iy + 1) * 57, seed), d = hash1(ix + 1 + (iy + 1) * 57, seed);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const easeOut = t => 1 - (1 - t) * (1 - t) * (1 - t);

// colours as [r,g,b] 0..255
export function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mix(a, b, t, out = [0, 0, 0]) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; }
export function css(c, a = 1) { return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`; }

// distance from point to segment; writes closest point into out
export function segDist(px, py, ax, ay, bx, by, out) {
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cy = ay + dy * t; if (out) { out[0] = cx; out[1] = cy; }
  const ex = px - cx, ey = py - cy; return Math.sqrt(ex * ex + ey * ey);
}
