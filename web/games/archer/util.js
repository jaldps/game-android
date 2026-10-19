// Small math/color/canvas helpers shared by all Bowbrawl modules.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export const easeOut = t => 1 - (1 - t) * (1 - t);
export const easeOutBack = t => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);

export function mulberry(seed) {
  let s = (seed >>> 0) || 1;
  const f = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.gauss = () => { let u = 0, v = 0; while (!u) u = f(); while (!v) v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  return f;
}

// --- colors ---
const cache = new Map();
export function hexToRgb(h) {
  let c = cache.get(h); if (c) return c;
  let s = h.replace('#', ''); if (s.length === 3) s = s.split('').map(x => x + x).join('');
  const n = parseInt(s, 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; cache.set(h, c); return c;
}
const toHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return toHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
export function shade(h, amt) { return amt >= 0 ? mix(h, '#ffffff', amt) : mix(h, '#000000', -amt); }
export function rgba(h, a) { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
/** multiply-tint a color toward an ambient light color */
export function tint(h, light, amt) { const A = hexToRgb(h), L = hexToRgb(light); return toHex(lerp(A[0], A[0] * L[0] / 255, amt), lerp(A[1], A[1] * L[1] / 255, amt), lerp(A[2], A[2] * L[2] / 255, amt)); }

export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

// 1D value noise (smooth), deterministic by seed
export function noise1(seed) {
  const r = mulberry(seed); const N = 512; const t = new Float32Array(N); for (let i = 0; i < N; i++) t[i] = r();
  return x => { const i = Math.floor(x), f = x - i; const a = t[((i % N) + N) % N], b = t[(((i + 1) % N) + N) % N]; return lerp(a, b, smooth(f)); };
}
export function fbm1(seed, oct = 4) {
  const ns = []; for (let i = 0; i < oct; i++) ns.push(noise1(seed + i * 101));
  return x => { let v = 0, a = 0.5, f = 1, s = 0; for (let i = 0; i < oct; i++) { v += ns[i](x * f) * a; s += a; a *= 0.5; f *= 2.03; } return v / s; };
}

/**
 * Cel-shaded shape: trace(ctx, dx, dy) appends a closed subpath offset by dx,dy.
 * o: {base, shadow, rim, outline, lw, L:{x,y} (unit vector TOWARD light in current local space), size, shadowAmt, rimW, gloss}
 */
export function cel(ctx, trace, o) {
  const L = o.L, s = o.size || 20;
  ctx.save();
  ctx.beginPath(); trace(ctx, 0, 0);
  ctx.fillStyle = o.shadow || o.base; ctx.fill();
  ctx.clip();
  const e = s * (o.shadowAmt ?? 0.3);
  ctx.beginPath(); trace(ctx, L.x * e, L.y * e); ctx.fillStyle = o.base; ctx.fill();
  if (o.gloss) { ctx.beginPath(); trace(ctx, L.x * e * 2.6, L.y * e * 2.6); ctx.fillStyle = o.gloss; ctx.fill(); }
  if (o.rim) { const r = o.rimW ?? Math.max(1.6, s * 0.09); ctx.beginPath(); trace(ctx, 0, 0); trace(ctx, -L.x * r, -L.y * r); ctx.fillStyle = o.rim; ctx.fill('evenodd'); }
  ctx.restore();
  if (o.outline) { ctx.beginPath(); trace(ctx, 0, 0); ctx.lineWidth = o.lw || 3; ctx.strokeStyle = o.outline; ctx.lineJoin = 'round'; ctx.stroke(); }
}
/** rotate a vector by -a (to bring a world-space light dir into a rotated local space) */
export function rotL(L, a) { const c = Math.cos(-a), s = Math.sin(-a); return { x: L.x * c - L.y * s, y: L.x * s + L.y * c }; }

export function roundRect(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
export function star(ctx, x, y, r1, r2, n, rot = 0) { for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n - Math.PI / 2, r = i % 2 ? r2 : r1; i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
