// Procedural canvas textures + shared curved-world materials.
import * as THREE from 'three';
import { curved, GLOW, R } from './render.js';
import { TRACK_HALF, LANES } from './config.js';

// ---------- noise helpers ----------
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s, per) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const P = per || 1e9; const x0 = ((xi % P) + P) % P, x1 = (((xi + 1) % P) + P) % P, y0 = ((yi % P) + P) % P, y1 = (((yi + 1) % P) + P) % P;
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s, oct = 4, per = 0) { let v = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { v += a * vnoise(x * f, y * f, s + o * 17, per ? per * f : 0); n += a; a *= 0.5; f *= 2; } return v / n; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = true, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// fill a canvas per-pixel with fn(u,v) -> [r,g,b]
function pixels(w, h, fn) {
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = fn(x, y), i = (y * w + x) * 4; d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = p[3] ?? 255; }
  ctx.putImageData(img, 0, 0); return c;
}
const cl = v => v < 0 ? 0 : v > 255 ? 255 : v;

export const TEX = {};
export const M = {};
const glowMats = [];

function makeTextures() {
  const N = 256;
  // fluffy snow: soft blue-grey undulation + sparkles
  TEX.snow = tex(pixels(N, N, (x, y) => {
    const n = fbm(x / 32, y / 32, 3, 4, 8), m = fbm(x / 9, y / 9, 9, 3, 28);
    let v = 236 + (n - 0.5) * 30 + (m - 0.5) * 10; const sp = hash(x, y, 77) > 0.996 ? 22 : 0;
    return [cl(v - 10 + sp), cl(v - 3 + sp), cl(v + 10 + sp)];
  }));
  TEX.snowBump = tex(pixels(N, N, (x, y) => { const v = fbm(x / 24, y / 24, 5, 4, 10.6667) * 255; return [v, v, v]; }), { srgb: false });
  // packed sled track: three icy grooves with runner lines, raised snow between lanes. u spans [-W..W], v repeats every 12 units
  const TW = 512, TH = 512, W = TRACK_HALF + 0.5;
  const track = pixels(TW, TH, (x, y) => {
    const wx = (x / TW) * 2 * W - W;
    let dl = 9; for (const L of LANES) dl = Math.min(dl, Math.abs(wx - L));
    const n = fbm(x / 40, y / 40, 11, 4, 0), fine = fbm(x / 6, y / 6, 13, 2, 0);
    const groove = Math.max(0, 1 - dl / 0.95);                // 1 at lane centre
    const runner = Math.max(0, 1 - Math.abs(dl - 0.42) / 0.07);  // two runner lines per lane
    const edge = Math.max(0, (Math.abs(wx) - (W - 0.75)) / 0.75);
    let r = 238, g = 244, b = 252;
    // icy groove: blue, darker
    r -= groove * 42; g -= groove * 26; b -= groove * 6;
    r += runner * 26; g += runner * 24; b += runner * 14;
    r += (n - 0.5) * 22 + (fine - 0.5) * 10; g += (n - 0.5) * 18 + (fine - 0.5) * 10; b += (n - 0.5) * 10;
    // scratch streaks along the direction of travel
    const streak = fbm(x / 1.5, y / 60, 21, 2, 0); if (groove > 0.2) { const s = (streak - 0.5) * 30 * groove; r += s; g += s; b += s * 0.6; }
    r -= edge * 10; g -= edge * 6;
    const sp = hash(x, y, 5) > 0.997 ? 30 : 0;
    return [cl(r + sp), cl(g + sp), cl(b + sp)];
  });
  TEX.track = tex(track); TEX.track.wrapS = THREE.ClampToEdgeWrapping;
  TEX.trackRough = tex(pixels(128, 128, (x, y) => { const wx = (x / 128) * 2 * W - W; let dl = 9; for (const L of LANES) dl = Math.min(dl, Math.abs(wx - L)); const g = Math.max(0, 1 - dl / 0.9); const v = 235 - g * 95 + (hash(x, y, 3) - 0.5) * 20; return [v, v, v]; }), { srgb: false });
  TEX.trackRough.wrapS = THREE.ClampToEdgeWrapping;
  // plaster (tinted by instance colour)
  TEX.plaster = tex(pixels(N, N, (x, y) => { const n = fbm(x / 20, y / 20, 31, 4, 12.8), m = fbm(x / 4, y / 4, 33, 2, 64); const v = 228 + (n - 0.5) * 40 + (m - 0.5) * 14; return [cl(v), cl(v - 2), cl(v - 6)]; }));
  // wood planks (horizontal boards) tinted by vertex colour
  TEX.wood = tex(pixels(N, N, (x, y) => {
    const board = Math.floor(y / 32), by = (y % 32) / 32; const off = hash(board, 0, 4) * 200;
    const grain = fbm((x + off) / 60, y / 3, 41 + board, 3, 0); const ring = Math.sin((x + off) / 9 + grain * 8) * 0.5 + 0.5;
    let v = 200 + (grain - 0.5) * 60 + ring * 14; if (by < 0.07 || by > 0.95) v -= 90; const knot = hash(Math.floor((x + off) / 64), board, 9) > 0.8 ? Math.max(0, 1 - Math.hypot((x + off) % 64 - 32, by * 32 - 16) / 6) * 70 : 0;
    v -= knot; return [cl(v), cl(v * 0.93), cl(v * 0.86)];
  }));
  TEX.bark = tex(pixels(N, N, (x, y) => { const n = fbm(x / 6, y / 40, 51, 4, 42.6667); const v = 150 + (n - 0.5) * 140; return [cl(v), cl(v * 0.9), cl(v * 0.8)]; }));
  // cobble/stone
  TEX.stone = tex(pixels(N, N, (x, y) => {
    const s = 32, row = Math.floor(y / s), off = (row % 2) * s * 0.5, cx = Math.floor((x + off) / (s * 1.4)), lx = ((x + off) % (s * 1.4)) / (s * 1.4), ly = (y % s) / s;
    const e = Math.min(lx, 1 - lx, ly, 1 - ly) * 2; const mortar = e < 0.12 ? 1 : 0;
    const tone = hash(cx, row, 61) * 40, n = fbm(x / 8, y / 8, 63, 3, 32);
    const v = mortar ? 150 : 190 + tone + (n - 0.5) * 40 - (e < 0.25 ? (0.25 - e) * 120 : 0);
    return [cl(v), cl(v * 0.98), cl(v * 1.02)];
  }));
  // lit window: warm interior with mullions + curtains (also used as emissive map)
  const wc = canvas(128, 160), w = wc.getContext('2d');
  w.fillStyle = '#3a2416'; w.fillRect(0, 0, 128, 160);
  const gi = w.createRadialGradient(64, 100, 6, 64, 90, 110); gi.addColorStop(0, '#fff3c2'); gi.addColorStop(0.45, '#ffc861'); gi.addColorStop(1, '#e07a22');
  w.fillStyle = gi; w.fillRect(10, 10, 108, 140);
  w.fillStyle = 'rgba(200,60,40,0.85)'; w.beginPath(); w.moveTo(10, 10); w.quadraticCurveTo(40, 60, 22, 150); w.lineTo(10, 150); w.fill(); w.beginPath(); w.moveTo(118, 10); w.quadraticCurveTo(88, 60, 106, 150); w.lineTo(118, 150); w.fill();
  w.fillStyle = '#4a2c18'; w.fillRect(60, 10, 8, 140); w.fillRect(10, 72, 108, 8);
  w.fillStyle = 'rgba(255,255,255,0.9)'; w.fillRect(0, 148, 128, 12); // snowy sill
  TEX.window = tex(wc, { repeat: false });
  const we = canvas(128, 160), e = we.getContext('2d'); e.drawImage(wc, 0, 0); e.fillStyle = '#000'; e.fillRect(0, 0, 128, 10); e.fillRect(0, 0, 10, 160); e.fillRect(118, 0, 10, 160); e.fillRect(60, 10, 8, 140); e.fillRect(10, 72, 108, 8); e.fillRect(0, 148, 128, 12);
  TEX.windowE = tex(we, { repeat: false });
  // soft glow sprite
  const gc = canvas(64, 64), g = gc.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); TEX.glow = tex(gc, { repeat: false });
  // flake sprite (falling snow)
  const fc = canvas(32, 32), f = fc.getContext('2d'); const fr = f.createRadialGradient(16, 16, 0, 16, 16, 16); fr.addColorStop(0, 'rgba(255,255,255,1)'); fr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); fr.addColorStop(1, 'rgba(255,255,255,0)'); f.fillStyle = fr; f.fillRect(0, 0, 32, 32); TEX.flake = tex(fc, { repeat: false });
  // coin face: gold disc with embossed snowflake
  const cc = canvas(128, 128), c = cc.getContext('2d');
  const cg = c.createRadialGradient(50, 44, 4, 64, 64, 64); cg.addColorStop(0, '#fff6b0'); cg.addColorStop(0.55, '#ffcc2e'); cg.addColorStop(1, '#d98a0b');
  c.fillStyle = cg; c.beginPath(); c.arc(64, 64, 63, 0, 7); c.fill();
  c.strokeStyle = '#b86e05'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 52, 0, 7); c.stroke();
  c.save(); c.translate(64, 64); c.lineCap = 'round';
  for (const [col, lw, dx] of [['#b5690a', 9, 2], ['#fff4c0', 6, -1]]) { c.strokeStyle = col; c.lineWidth = lw; for (let i = 0; i < 6; i++) { c.save(); c.translate(dx, dx); c.rotate(i * Math.PI / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -34); c.moveTo(0, -20); c.lineTo(-9, -29); c.moveTo(0, -20); c.lineTo(9, -29); c.stroke(); c.restore(); } }
  c.restore(); TEX.coin = tex(cc, { repeat: false });
  // festive banner fabric: red with gold scallops + white stars
  const bc = canvas(256, 64), b = bc.getContext('2d');
  b.fillStyle = '#d4262e'; b.fillRect(0, 0, 256, 64); b.fillStyle = '#9e1620'; b.fillRect(0, 50, 256, 14);
  b.fillStyle = '#ffd34a'; for (let i = 0; i < 16; i++) { b.beginPath(); b.arc(i * 16 + 8, 50, 8, 0, Math.PI); b.fill(); }
  b.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { const sx = 22 + i * 43, sy = 24; b.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? 4.5 : 11; b.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } b.fill(); }
  b.fillStyle = '#ffd34a'; b.fillRect(0, 0, 256, 5);
  TEX.banner = tex(bc, { repeat: false });
  // hazard stripes (red/white) for barriers
  const hc = canvas(128, 32), hh = hc.getContext('2d'); hh.fillStyle = '#f7f3ea'; hh.fillRect(0, 0, 128, 32); hh.fillStyle = '#d8312e'; for (let i = -2; i < 10; i++) { hh.beginPath(); hh.moveTo(i * 16, 32); hh.lineTo(i * 16 + 8, 32); hh.lineTo(i * 16 + 24, 0); hh.lineTo(i * 16 + 16, 0); hh.fill(); }
  TEX.stripes = tex(hc);
  // ice with cracks
  TEX.ice = tex(pixels(N, N, (x, y) => { const n = fbm(x / 30, y / 30, 71, 4, 8.5333); const cr = Math.abs(fbm(x / 18, y / 18, 73, 3, 14.2222) - 0.5) < 0.012 ? 50 : 0; const v = 170 + (n - 0.5) * 70; return [cl(v * 0.75 + cr), cl(v * 0.92 + cr), cl(v + 30 + cr)]; }));
  // fur noise for the yeti
  TEX.fur = tex(pixels(N, N, (x, y) => { const n = fbm(x / 3, y / 14, 81, 3, 85.3333), m = fbm(x / 16, y / 16, 83, 3, 16); const v = 205 + (n - 0.5) * 90 + (m - 0.5) * 30; return [cl(v), cl(v), cl(v + 8)]; }));
  // present wrapping paper (stripes) tinted by vertex colour
  TEX.wrap = tex(pixels(64, 64, (x, y) => { const s = ((x + y) % 16) < 6 ? 255 : 205; return [s, s, s]; }));
}

function std(o, key) { const m = new THREE.MeshStandardMaterial(o); m.userData.key = key; return curved(m); }
export function initMaterials() {
  makeTextures();
  M.snow = std({ map: TEX.snow, bumpMap: TEX.snowBump, bumpScale: 1.2, roughness: 0.92, color: '#ffffff' }, 'snow');
  M.snowV = std({ map: TEX.snow, roughness: 0.9, vertexColors: true }, 'snowV');
  M.track = std({ map: TEX.track, roughnessMap: TEX.trackRough, roughness: 1, metalness: 0.0, envMapIntensity: 0.55 }, 'track');
  M.plaster = std({ map: TEX.plaster, roughness: 0.9, vertexColors: true }, 'plaster');
  M.wood = std({ map: TEX.wood, roughness: 0.75, vertexColors: true }, 'wood');
  M.bark = std({ map: TEX.bark, roughness: 0.95, vertexColors: true }, 'bark');
  M.stone = std({ map: TEX.stone, roughness: 0.9, vertexColors: true }, 'stone');
  M.paint = std({ roughness: 0.62, vertexColors: true }, 'paint');
  M.gloss = std({ roughness: 0.28, metalness: 0.05, vertexColors: true }, 'gloss');
  M.metal = std({ roughness: 0.3, metalness: 0.85, vertexColors: true }, 'metal');
  M.pine = std({ roughness: 0.88, vertexColors: true }, 'pine');
  M.window = std({ map: TEX.window, emissiveMap: TEX.windowE, emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.4, vertexColors: true }, 'window'); glowMats.push([M.window, 1.15]);
  M.lamp = std({ color: '#fff4cf', emissive: '#ffd27a', emissiveIntensity: 2, roughness: 0.4, vertexColors: true }, 'lamp'); glowMats.push([M.lamp, 2.4]);
  M.banner = std({ map: TEX.banner, roughness: 0.75, side: THREE.DoubleSide }, 'banner');
  M.stripes = std({ map: TEX.stripes, roughness: 0.55 }, 'stripes');
  M.ice = std({ map: TEX.ice, color: '#d2f2ff', roughness: 0.08, metalness: 0.0, envMapIntensity: 1.6, transparent: true, opacity: 0.9 }, 'ice');
  M.river = std({ map: TEX.ice, color: '#b8e2f5', roughness: 0.12, metalness: 0.1, envMapIntensity: 1.4 }, 'river');
  M.coin = std({ map: TEX.coin, color: '#ffffff', emissive: '#ffb21a', emissiveIntensity: 0.25, roughness: 0.25, metalness: 0.7, envMapIntensity: 1.6 }, 'coin');
  M.coinEdge = std({ color: '#f0a51c', emissive: '#ff9a00', emissiveIntensity: 0.2, roughness: 0.3, metalness: 0.8 }, 'coinEdge');
  M.wrap = std({ map: TEX.wrap, roughness: 0.5, vertexColors: true }, 'wrap');
  M.fur = std({ map: TEX.fur, roughness: 0.95, vertexColors: true }, 'fur');
  M.bulbs = curved(new THREE.PointsMaterial({ size: 0.55, map: TEX.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  M.bulbs.userData.key = 'bulbs';
  return M;
}
export function updateGlow() {
  for (const [m, base] of glowMats) m.emissiveIntensity = base * GLOW.value;
  if (M.bulbs) M.bulbs.opacity = Math.min(1, 0.55 + 0.25 * GLOW.value);
  if (M.coin) M.coin.emissiveIntensity = R.tod === 'night' ? 0.45 : 0.22;
}
