// Procedural canvas textures (tileable where needed). All generated once per biome and cached.
import * as THREE from 'three';
import { mulberry, makeNoise } from './rng.js';

const cache = new Map();
function mk(key, w, h, fn, { repeat = true, srgb = true, mip = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); fn(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  cache.set(key, t);
  return t;
}
export const canvasTex = (w, h, fn, opts) => mk('u' + Math.random(), w, h, fn, opts);

function wrapDraw(w, h, x, y, r, fn) {
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const px = x + ox * w, py = y + oy * h;
    if (px + r < 0 || px - r > w || py + r < 0 || py - r > h) continue;
    fn(px, py);
  }
}
const C = new THREE.Color();
function shade(c, k) { C.set(c); C.r = Math.min(1, C.r * k); C.g = Math.min(1, C.g * k); C.b = Math.min(1, C.b * k); return '#' + C.getHexString(); }
function rgb(c) { C.set(c); return [C.r * 255, C.g * 255, C.b * 255]; }

/** seamless multi-octave noise field written into ImageData, colouring by palette ramp */
function noiseFill(g0, W0, H0, seed, pal, scale = 4, oct = 5, contrast = 1.0) {
  // computed at half resolution then upscaled (noise is low-frequency anyway)
  const w = W0 >> 1, h = H0 >> 1; const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  const N = makeNoise(seed); const img = g.createImageData(w, h); const d = img.data;
  const P = pal.map(rgb);
  const f = (x, y) => N.fbm(x / w * scale, y / h * scale, oct);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // seamless blend of four offset samples
    const a = f(x, y), b = f(x - w, y), c = f(x, y - h), e = f(x - w, y - h);
    const fx = x / w, fy = y / h;
    let v = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + e * fx * fy;
    v = Math.max(0, Math.min(0.9999, 0.5 + v * 0.9 * contrast));
    const t = v * (P.length - 1), i = Math.floor(t), q = t - i;
    const p0 = P[i], p1 = P[i + 1] || p0; const k = (y * w + x) * 4;
    d[k] = p0[0] + (p1[0] - p0[0]) * q; d[k + 1] = p0[1] + (p1[1] - p0[1]) * q; d[k + 2] = p0[2] + (p1[2] - p0[2]) * q; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g0.imageSmoothingEnabled = true; g0.drawImage(cv, 0, 0, W0, H0);
}
function speckle(g, w, h, R, cols, n, sz, alpha = [0.25, 0.75]) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = sz * (0.4 + R());
    g.fillStyle = shade(cols[Math.floor(R() * cols.length)], 0.8 + R() * 0.4);
    g.globalAlpha = alpha[0] + R() * (alpha[1] - alpha[0]);
    wrapDraw(w, h, x, y, r, (px, py) => { g.beginPath(); g.ellipse(px, py, r, r * (0.6 + R() * 0.4), R() * 3, 0, 7); g.fill(); });
  }
  g.globalAlpha = 1;
}
function pebbles(g, w, h, R, cols, n, r0, r1) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = r0 + R() * (r1 - r0), rot = R() * 3, el = 0.6 + R() * 0.4;
    const c = cols[Math.floor(R() * cols.length)];
    wrapDraw(w, h, x, y, r * 2, (px, py) => {
      g.globalAlpha = 0.45; g.fillStyle = 'rgba(0,0,0,0.6)';
      g.beginPath(); g.ellipse(px + r * 0.25, py + r * 0.3, r, r * el, rot, 0, 7); g.fill();
      g.globalAlpha = 1;
      const gr = g.createRadialGradient(px - r * 0.3, py - r * 0.35, r * 0.1, px, py, r * 1.1);
      gr.addColorStop(0, shade(c, 1.35)); gr.addColorStop(0.6, c); gr.addColorStop(1, shade(c, 0.6));
      g.fillStyle = gr; g.beginPath(); g.ellipse(px, py, r, r * el, rot, 0, 7); g.fill();
    });
  }
  g.globalAlpha = 1;
}
function blades(g, w, h, R, cols, n, l0, l1, wd = 1.3) {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, l = l0 + R() * (l1 - l0), a = R() * Math.PI * 2;
    g.strokeStyle = shade(cols[Math.floor(R() * cols.length)], 0.8 + R() * 0.45); g.globalAlpha = 0.5 + R() * 0.5; g.lineWidth = wd * (0.6 + R() * 0.8);
    const cx = Math.cos(a) * l, cy = Math.sin(a) * l, bend = (R() - 0.5) * l * 0.6;
    wrapDraw(w, h, x, y, l, (px, py) => { g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + cx * 0.5 - cy * bend / l, py + cy * 0.5 + cx * bend / l, px + cx, py + cy); g.stroke(); });
  }
  g.globalAlpha = 1;
}
function leaves(g, w, h, R, cols, n, s0, s1) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, s = s0 + R() * (s1 - s0), a = R() * 7;
    const c = cols[Math.floor(R() * cols.length)];
    wrapDraw(w, h, x, y, s * 2, (px, py) => {
      g.save(); g.translate(px, py); g.rotate(a);
      g.fillStyle = 'rgba(30,15,5,0.35)'; g.beginPath(); g.ellipse(s * 0.2, s * 0.25, s, s * 0.5, 0, 0, 7); g.fill();
      g.fillStyle = shade(c, 0.85 + R() * 0.3); g.beginPath();
      g.moveTo(-s, 0); g.quadraticCurveTo(0, -s * 0.75, s, 0); g.quadraticCurveTo(0, s * 0.75, -s, 0); g.fill();
      g.strokeStyle = shade(c, 0.6); g.lineWidth = 0.8; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke();
      g.restore();
    });
  }
}

// ------------------------------------------------------------------ ground (off-trail)
export function groundTexture(b, id) {
  return mk('ground_' + id, 512, 512, (g, w, h) => {
    const R = mulberry(17 + id.length * 7);
    noiseFill(g, w, h, 5 + id.length, [shade(b.grass[4], 0.9), b.grass[1], b.grass[0], b.grass[2], b.grass[3]], 5, 5, 1.3);
    if (id === 'desert') {
      speckle(g, w, h, R, b.dirt, 2500, 2.5, [0.15, 0.45]);
      // wind ripples
      g.strokeStyle = 'rgba(120,50,20,0.10)'; g.lineWidth = 2;
      for (let k = 0; k < 26; k++) { const y0 = R() * h; for (const oy of [-h, 0, h]) { g.beginPath(); for (let x = 0; x <= w; x += 8) { const y = y0 + oy + Math.sin(x * 0.03 + k) * 6; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } }
      pebbles(g, w, h, R, b.rock, 160, 1.5, 4.5);
      blades(g, w, h, R, b.blade, 260, 4, 10, 1.1);
    } else if (id === 'autumn') {
      speckle(g, w, h, R, b.grass, 1400, 5, [0.2, 0.6]);
      blades(g, w, h, R, b.blade, 1600, 4, 10);
      leaves(g, w, h, R, ['#d0661e', '#e09a2a', '#b4401c', '#c9a23a', '#8a4a1e', '#e2b84a', '#9a2e14'], 900, 4, 8);
    } else if (id === 'village') {
      speckle(g, w, h, R, b.grass, 1600, 4, [0.2, 0.6]);
      blades(g, w, h, R, b.blade, 2600, 4, 11);
      pebbles(g, w, h, R, b.rock, 140, 2, 6);
    } else {
      speckle(g, w, h, R, b.grass, 1500, 5, [0.2, 0.55]);
      blades(g, w, h, R, b.blade, 5200, 4, 11);
      // clover / moss blobs
      speckle(g, w, h, R, ['#5d8a2a', '#77a03a', '#3d6a1e'], 260, 6, [0.25, 0.5]);
      pebbles(g, w, h, R, ['#8a7a66', '#a39484'], 40, 1.5, 3.5);
    }
  });
}

// ------------------------------------------------------------------ trail surface
export function trailTexture(b, id) {
  return mk('trail_' + id, 512, 512, (g, w, h) => {
    const R = mulberry(91 + id.length * 3);
    if (b.trail === 'cobble') {
      noiseFill(g, w, h, 33, ['#9d978c', '#b5aea2', '#c4bdb0'], 6, 3);
      // staggered rounded setts
      const rows = 8, cols = 7, cw = w / cols, ch = h / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols + 1; c++) {
        const x = (c + (r % 2) * 0.5) * cw + (R() - 0.5) * 6, y = (r + 0.5) * ch + (R() - 0.5) * 5;
        const rw = cw * (0.40 + R() * 0.06), rh = ch * (0.38 + R() * 0.06);
        const base = b.dirt[Math.floor(R() * b.dirt.length)];
        wrapDraw(w, h, x, y, cw, (px, py) => {
          g.fillStyle = 'rgba(60,55,45,0.35)'; g.beginPath(); g.roundRect(px - rw + 3, py - rh + 4, rw * 2, rh * 2, rh * 0.8); g.fill();
          const gr = g.createRadialGradient(px - rw * 0.3, py - rh * 0.4, 2, px, py, rw * 1.3);
          gr.addColorStop(0, shade(base, 1.18)); gr.addColorStop(0.65, base); gr.addColorStop(1, shade(base, 0.72));
          g.fillStyle = gr; g.beginPath(); g.roundRect(px - rw, py - rh, rw * 2, rh * 2, rh * 0.8); g.fill();
        });
      }
      speckle(g, w, h, R, ['#7d776c', '#e8e2d6'], 900, 1.6, [0.1, 0.35]);
      return;
    }
    noiseFill(g, w, h, 21 + id.length, [shade(b.dirt[3], 0.85), b.dirt[1], b.dirt[0], b.dirt[2], b.dirt[4] || b.dirt[2]], 6, 5, 1.2);
    speckle(g, w, h, R, b.dirt, 2600, 3.5, [0.15, 0.55]);
    if (id === 'desert') {
      pebbles(g, w, h, R, ['#e8b890', '#a85a34', '#f0d0b0', '#8a4224', '#c47a4a'], 380, 1.5, 5);
    } else {
      pebbles(g, w, h, R, b.rock, 420, 1.5, 6);
      pebbles(g, w, h, R, b.rock, 18, 7, 12);
    }
    // dry cracks
    g.strokeStyle = 'rgba(40,20,10,0.25)'; g.lineWidth = 1.2;
    for (let k = 0; k < 18; k++) { let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (R() - 0.5) * 30; y += (R() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    if (id === 'autumn') leaves(g, w, h, R, ['#c0561a', '#d89a2a', '#9a3014', '#6a3a14'], 120, 3, 6);
  });
}

// ------------------------------------------------------------------ rock faces
export function rockTexture(b, id) {
  return mk('rock_' + id, 512, 512, (g, w, h) => {
    const R = mulberry(55 + id.length);
    if (id === 'desert') {
      // horizontal sandstone strata
      const N = makeNoise(9);
      const img = g.createImageData(w, h), d = img.data; const P = ['#9a4626', '#b85a32', '#cf7444', '#e09a66', '#c4683a', '#a85030', '#d88a58', '#efb886'].map(rgb);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const warp = N.fbm(x / w * 3, y / h * 3, 3) * 18;
        const band = ((y + warp) / h * 9) % 1; const bi = Math.floor(((y + warp + h) / h * 9)) % P.length;
        const c = P[bi], c2 = P[(bi + 1) % P.length]; const t = Math.pow(band, 3);
        const n = 0.85 + N.fbm(x / w * 16, y / h * 40, 3) * 0.35;
        const k = (y * w + x) * 4; d[k] = (c[0] + (c2[0] - c[0]) * t) * n; d[k + 1] = (c[1] + (c2[1] - c[1]) * t) * n; d[k + 2] = (c[2] + (c2[2] - c[2]) * t) * n; d[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      g.strokeStyle = 'rgba(60,20,8,0.35)'; g.lineWidth = 1.5;
      for (let k = 0; k < 30; k++) { let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 5; s++) { x += (R() - 0.5) * 12; y += R() * 26; g.lineTo(x, y); } g.stroke(); }
      return;
    }
    noiseFill(g, w, h, 77 + id.length, [shade(b.rock[3], 0.7), b.rock[1], b.rock[0], b.rock[2], shade(b.rock[2], 1.15)], 5, 6, 1.4);
    speckle(g, w, h, R, b.rock, 3000, 1.8, [0.2, 0.6]);
    // cracks
    g.strokeStyle = 'rgba(25,25,25,0.4)'; g.lineWidth = 1.4;
    for (let k = 0; k < 22; k++) { let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 7; s++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    if (id === 'pine' || id === 'autumn') speckle(g, w, h, R, ['#9aa84a', '#c8c890', '#7a8a3a'], 120, 9, [0.25, 0.5]); // lichen
  });
}

export function noiseTexture() {
  return mk('noise', 256, 256, (g, w, h) => noiseFill(g, w, h, 3, ['#000000', '#808080', '#ffffff'], 4, 5, 1.6), { srgb: false });
}

// ------------------------------------------------------------------ bark
export function barkTexture(kind) {
  return mk('bark_' + kind, 128, 256, (g, w, h) => {
    const R = mulberry(kind.length * 13);
    if (kind === 'birch') {
      g.fillStyle = '#e8e4da'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, R, ['#d8d2c4', '#f4f0e8', '#c8c0b0'], 400, 4, [0.3, 0.7]);
      for (let i = 0; i < 40; i++) { const y = R() * h, x = R() * w, l = 6 + R() * 22; g.fillStyle = `rgba(30,25,20,${0.5 + R() * 0.4})`; g.fillRect(x, y, l, 1.5 + R() * 3); }
      return;
    }
    const base = kind === 'pine' ? ['#4a3122', '#6a4630', '#3a251a', '#7a5238'] : kind === 'olive' ? ['#6a6458', '#7d776a', '#4e4a42', '#8f897a'] : ['#4a3a2c', '#5e4a38', '#352a20', '#6e5844'];
    g.fillStyle = base[0]; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = R() * w, wd = 3 + R() * 8; g.fillStyle = shade(base[Math.floor(R() * 4)], 0.8 + R() * 0.4); g.globalAlpha = 0.7;
      g.beginPath(); let y = 0; g.moveTo(x, 0); while (y < h) { y += 10 + R() * 20; g.lineTo(x + (R() - 0.5) * 6, y); } g.lineTo(x + wd, h); g.lineTo(x + wd, 0); g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(15,8,4,0.55)'; g.lineWidth = 1.6;
    for (let i = 0; i < 26; i++) { const x = R() * w; g.beginPath(); g.moveTo(x, 0); let y = 0, xx = x; while (y < h) { y += 8 + R() * 14; xx += (R() - 0.5) * 5; g.lineTo(xx, y); } g.stroke(); }
  });
}

// ------------------------------------------------------------------ foliage cards (alpha)
export function pineBranchTexture() {
  return mk('pinebranch', 256, 256, (g, w, h) => {
    const R = mulberry(5);
    g.clearRect(0, 0, w, h);
    // branch drawn left->right (u along branch), centred on v=0.5
    const cols = ['#1f3d1c', '#2a4f22', '#36602a', '#244a20', '#456e30'];
    g.lineCap = 'round';
    const twig = (x0, y0, ang, len, wd, depth) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      g.strokeStyle = '#3a2a1a'; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      // needles
      const n = Math.floor(len / 2.2);
      for (let i = 0; i < n; i++) {
        const t = i / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t; const nl = (1 - t * 0.5) * (9 + R() * 5) * (depth ? 0.75 : 1);
        for (const sgn of [-1, 1]) {
          const a = ang + sgn * (0.9 + R() * 0.4);
          g.strokeStyle = cols[Math.floor(R() * cols.length)]; g.lineWidth = 1.6 + R();
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * nl, py + Math.sin(a) * nl); g.stroke();
        }
      }
      if (depth < 1) for (let k = 0; k < 6; k++) { const t = 0.15 + k * 0.13; twig(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ang + (k % 2 ? 0.7 : -0.7) * (0.8 + R() * 0.4), len * (0.42 - t * 0.2), wd * 0.5, depth + 1); }
    };
    twig(6, h / 2, 0, w - 16, 4, 0);
    // tip highlight
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(160,200,90,0.25)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
  }, { repeat: false });
}
export function leafClusterTexture(kind) {
  return mk('leaf_' + kind, 256, 256, (g, w, h) => {
    const R = mulberry(kind.length * 31);
    g.clearRect(0, 0, w, h);
    const cols = kind === 'olive' ? ['#6f7f4e', '#8a9a62', '#56663e', '#a3ae7a', '#7a8a58'] : kind === 'bush' ? ['#4e7a2a', '#5e8a32', '#3e6a22', '#76a040'] : kind === 'bougain' ? ['#e0287a', '#f04a9a', '#c01a62', '#ff74b4', '#3e6a22'] : ['#ffffff', '#f0f0f0', '#d8d8d8', '#e8e8e8', '#c8c8c8'];
    // twigs
    g.strokeStyle = 'rgba(70,50,30,0.9)'; g.lineWidth = 2.5; g.lineCap = 'round';
    for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(w / 2, h * 0.95); g.quadraticCurveTo(w / 2 + (R() - 0.5) * 60, h * 0.6, w * (0.15 + R() * 0.7), h * (0.1 + R() * 0.5)); g.stroke(); }
    const n = kind === 'olive' ? 520 : 380;
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, r = Math.sqrt(R()) * w * 0.44; const x = w / 2 + Math.cos(a) * r, y = h * 0.47 + Math.sin(a) * r * 0.9;
      const s = kind === 'olive' ? 5 + R() * 4 : 7 + R() * 6; const rot = R() * 7;
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = shade(cols[Math.floor(R() * cols.length)], 0.75 + R() * 0.45);
      g.beginPath();
      if (kind === 'autumn') { // maple-ish lobed leaf
        for (let k = 0; k < 5; k++) { const aa = k / 5 * 6.283; g.lineTo(Math.cos(aa) * s, Math.sin(aa) * s); g.lineTo(Math.cos(aa + 0.63) * s * 0.45, Math.sin(aa + 0.63) * s * 0.45); }
      } else { g.ellipse(0, 0, s, s * (kind === 'olive' ? 0.28 : 0.5), 0, 0, 7); }
      g.fill(); g.restore();
    }
  }, { repeat: false });
}
export function grassCardTexture(kind) {
  return mk('grass_' + kind, 256, 128, (g, w, h) => {
    const R = mulberry(kind.length * 7 + 3);
    g.clearRect(0, 0, w, h);
    const cols = { green: ['#4f7a24', '#6a9a30', '#86b04a', '#3e6a1e', '#9abb5a'], dry: ['#a8a060', '#c2b878', '#8a8a48', '#d0c48a', '#9a9050'], sage: ['#8a9a6a', '#a2ae80', '#6a7a50', '#b8bc90'], fern: ['#7a8a30', '#9a8a2a', '#b07a26', '#5e6a26', '#c49a3a'] }[kind];
    g.lineCap = 'round';
    const n = kind === 'fern' ? 26 : 120;
    for (let i = 0; i < n; i++) {
      const x0 = w * (0.08 + R() * 0.84), hh = h * (0.45 + R() * 0.52), lean = (R() - 0.5) * 50;
      const c = cols[Math.floor(R() * cols.length)];
      const gr = g.createLinearGradient(0, h, 0, h - hh); gr.addColorStop(0, shade(c, 0.45)); gr.addColorStop(1, shade(c, 1.15));
      if (kind === 'fern') {
        g.strokeStyle = gr; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x0, h); g.quadraticCurveTo(x0 + lean * 0.4, h - hh * 0.6, x0 + lean, h - hh); g.stroke();
        for (let k = 1; k < 12; k++) { const t = k / 12, px = x0 + lean * t * t, py = h - hh * t; const l = (1 - t) * 16 + 3; g.lineWidth = 2.5; g.beginPath(); g.moveTo(px, py); g.lineTo(px - l, py - l * 0.3); g.moveTo(px, py); g.lineTo(px + l, py - l * 0.3); g.stroke(); }
      } else {
        g.strokeStyle = gr; g.lineWidth = 1.5 + R() * 2.2;
        g.beginPath(); g.moveTo(x0, h); g.quadraticCurveTo(x0 + lean * 0.3, h - hh * 0.6, x0 + lean, h - hh); g.stroke();
      }
    }
    if (kind === 'green' || kind === 'dry') {
      const fc = kind === 'green' ? ['#ffffff', '#ffe14a', '#c58aff', '#ff8ab0'] : ['#ffffff', '#ffd23a'];
      for (let i = 0; i < 9; i++) { const x = w * (0.1 + R() * 0.8), y = h * (0.15 + R() * 0.4); g.fillStyle = fc[Math.floor(R() * fc.length)]; for (let k = 0; k < 5; k++) { const a = k * 1.256; g.beginPath(); g.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.6, 0, 7); g.fill(); } g.fillStyle = '#e8a020'; g.beginPath(); g.arc(x, y, 1.8, 0, 7); g.fill(); }
    }
  }, { repeat: false });
}

// ------------------------------------------------------------------ wood / props
export function woodTexture() {
  return mk('wood', 256, 256, (g, w, h) => {
    const R = mulberry(77);
    const planks = 4, ph = h / planks;
    for (let p = 0; p < planks; p++) {
      const base = ['#8a5e36', '#9a6a3e', '#7a5230', '#a87444'][p % 4];
      g.fillStyle = base; g.fillRect(0, p * ph, w, ph);
      for (let i = 0; i < 40; i++) { g.strokeStyle = shade(base, 0.7 + R() * 0.5); g.globalAlpha = 0.5; g.lineWidth = 1 + R() * 1.5; const y = p * ph + R() * ph; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 2); g.stroke(); }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(20,10,4,0.65)'; g.fillRect(0, p * ph, w, 2.5); g.fillStyle = 'rgba(255,230,190,0.15)'; g.fillRect(0, p * ph + 2.5, w, 2);
      for (const nx of [12, w - 12]) { g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(nx, p * ph + ph * 0.3, 2.2, 0, 7); g.arc(nx, p * ph + ph * 0.7, 2.2, 0, 7); g.fill(); }
    }
  });
}
export function tapeTexture() {
  return mk('tape', 128, 16, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#1a1a1a' : '#ffd21a'; g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 16, 0); g.lineTo(i * 16 + 8, h); g.lineTo(i * 16 - 8, h); g.fill(); }
    g.fillStyle = '#ffd21a'; g.beginPath(); g.moveTo(128, 0); g.lineTo(136, 0); g.lineTo(128, h); g.lineTo(120, h); g.fill();
  });
}
export function bannerTexture(text, bg = '#ff5a1a', fg = '#ffffff', w = 1024, h = 128) {
  return mk('banner_' + text + bg, w, h, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, shade(bg, 1.15)); gr.addColorStop(1, shade(bg, 0.8));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 10, w, 10); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, 0, w, 6);
    g.font = `${Math.round(h * 0.62)}px "Russo One", "Bungee", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const reps = Math.max(1, Math.round(w / (h * 6)));
    for (let i = 0; i < reps; i++) {
      const x = (i + 0.5) * w / reps;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(text, x + 4, h / 2 + 5);
      g.fillStyle = fg; g.fillText(text, x, h / 2 + 2);
    }
  }, { repeat: true });
}
export function flagTexture() {
  return mk('flag', 64, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); });
}

// ------------------------------------------------------------------ white-washed house facade atlas (4 variants, 1 unit = 3 m tile)
export function houseTexture() {
  return mk('house', 512, 512, (g, w, h) => {
    const R = mulberry(303);
    const N = 2, cw = w / N, ch = h / N;
    for (let vy = 0; vy < N; vy++) for (let vx = 0; vx < N; vx++) {
      const x0 = vx * cw, y0 = vy * ch; const v = vy * N + vx;
      // plaster
      const gr = g.createLinearGradient(0, y0, 0, y0 + ch); gr.addColorStop(0, '#fbfaf6'); gr.addColorStop(1, '#ece8de');
      g.fillStyle = gr; g.fillRect(x0, y0, cw, ch);
      for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(${180 + R() * 40},${170 + R() * 40},${150 + R() * 40},${0.08 + R() * 0.1})`; g.beginPath(); g.arc(x0 + R() * cw, y0 + R() * ch, 2 + R() * 9, 0, 7); g.fill(); }
      // grime at bottom
      const gb = g.createLinearGradient(0, y0 + ch * 0.8, 0, y0 + ch); gb.addColorStop(0, 'rgba(120,110,90,0)'); gb.addColorStop(1, 'rgba(120,110,90,0.35)'); g.fillStyle = gb; g.fillRect(x0, y0 + ch * 0.8, cw, ch * 0.2);
      const blue = ['#1f5fbf', '#2a78d6', '#1a4f9e', '#3a8ad8'][v];
      if (v === 0 || v === 2) { // window with shutters
        const ww = cw * 0.3, wh = ch * 0.34, wx = x0 + cw * 0.35, wy = y0 + ch * 0.28;
        g.fillStyle = '#1a2230'; g.fillRect(wx, wy, ww, wh);
        g.fillStyle = 'rgba(140,180,220,0.35)'; g.fillRect(wx + 4, wy + 4, ww - 8, wh * 0.45);
        g.fillStyle = blue; g.fillRect(wx - ww * 0.42, wy, ww * 0.4, wh); g.fillRect(wx + ww + 2, wy, ww * 0.4, wh);
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(wx - ww * 0.42, wy + wh * k / 6); g.lineTo(wx - 2, wy + wh * k / 6); g.moveTo(wx + ww + 2, wy + wh * k / 6); g.lineTo(wx + ww * 1.42, wy + wh * k / 6); g.stroke(); }
        g.fillStyle = '#d8d2c4'; g.fillRect(wx - 6, wy + wh, ww + 12, 8);
        if (v === 2) { g.fillStyle = '#e83a8a'; for (let k = 0; k < 40; k++) { g.beginPath(); g.arc(wx + R() * ww, wy + wh + 4 + R() * 12, 3 + R() * 4, 0, 7); g.fill(); } g.fillStyle = '#3e6a22'; for (let k = 0; k < 14; k++) { g.beginPath(); g.arc(wx + R() * ww, wy + wh + 8 + R() * 8, 3, 0, 7); g.fill(); } }
      } else if (v === 1) { // door
        const dw = cw * 0.3, dh = ch * 0.58, dx = x0 + cw * 0.35, dy = y0 + ch - dh;
        g.fillStyle = '#e4ded0'; g.fillRect(dx - 8, dy - 8, dw + 16, dh + 8);
        g.fillStyle = blue; g.beginPath(); g.roundRect(dx, dy, dw, dh, [dw / 2, dw / 2, 0, 0]); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.strokeRect(dx + 8, dy + dh * 0.3, dw - 16, dh * 0.3); g.strokeRect(dx + 8, dy + dh * 0.66, dw - 16, dh * 0.28);
        g.fillStyle = '#c9a23a'; g.beginPath(); g.arc(dx + dw * 0.8, dy + dh * 0.6, 3, 0, 7); g.fill();
      } else { // small arched window + vent
        const ww = cw * 0.22, wh = ch * 0.26, wx = x0 + cw * 0.39, wy = y0 + ch * 0.32;
        g.fillStyle = '#1a2230'; g.beginPath(); g.roundRect(wx, wy, ww, wh, [ww / 2, ww / 2, 0, 0]); g.fill();
        g.strokeStyle = blue; g.lineWidth = 5; g.beginPath(); g.roundRect(wx, wy, ww, wh, [ww / 2, ww / 2, 0, 0]); g.stroke();
      }
    }
  });
}
export function domeTexture() {
  return mk('dome', 64, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2f7ae0'); gr.addColorStop(1, '#1a4fa8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
export function cactusTexture() {
  return mk('cactus', 128, 128, (g, w, h) => {
    const R = mulberry(8);
    for (let x = 0; x < w; x++) { const t = (x % 16) / 16; const k = 0.7 + 0.45 * Math.sin(t * Math.PI); g.fillStyle = shade('#5f8a3a', k); g.fillRect(x, 0, 1, h); }
    for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(240,230,200,0.7)'; const x = Math.floor(R() * 8) * 16 + 8, y = R() * h; g.fillRect(x - 0.5, y, 1.2, 1.2); }
  });
}
