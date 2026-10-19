// Scenery prefab shapes (local coords; facade faces +X i.e. toward the track when placed on the left side).
import * as THREE from 'three';
import { Builder, G, paint, jitter } from './geom.js';
import { TRACK_HALF, CHUNK } from './config.js';

const TIMBER = '#4a2c1a', ROOF = '#7a3a2a', SNOW = '#ffffff', ICE = '#d6f1ff', IRON = '#2b2f3a', DOOR = '#7a3f1f', STONE = '#bdb4aa';
const lin = c => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; };
export const BULB_COLS = ['#ff3b3b', '#36ff73', '#ffcf3d', '#4b9dff', '#ffffff', '#ff74d4'].map(c => new THREE.Color(c));

function windowUnit(B, x, y, z, w, h, shutter, facing = 1) {
  // window plane facing +X (facing=1) at x
  B.add('window', G.plane(w, h), '#ffffff', [x + 0.03 * facing, y, z], [0, facing > 0 ? Math.PI / 2 : -Math.PI / 2, 0]);
  B.add('wood', G.box(0.1, 0.1, w + 0.2), TIMBER, [x + 0.05 * facing, y + h / 2 + 0.05, z]);
  B.add('wood', G.box(0.16, 0.1, w + 0.3), TIMBER, [x + 0.08 * facing, y - h / 2 - 0.05, z]);
  B.add('snowV', G.rbox(0.28, 0.12, w + 0.28, 0.05), SNOW, [x + 0.12 * facing, y - h / 2 + 0.03, z]);
  if (shutter) for (const s of [-1, 1]) {
    B.add('wood', G.box(0.06, h * 1.02, w * 0.48), shutter, [x + 0.06 * facing, y, z + s * (w / 2 + w * 0.26)], [0, 0, 0], [1, 1, 1], [1, 2]);
  }
}
function door(B, x, y, z, facing = 1, wreath = true) {
  B.add('wood', G.box(0.12, 2.05, 1.15), DOOR, [x + 0.04 * facing, y + 1.02, z], [0, 0, 0], [1, 1, 1], [1, 2]);
  B.add('wood', G.box(0.18, 0.14, 1.45), TIMBER, [x + 0.07 * facing, y + 2.1, z]);
  B.add('metal', G.sph(0.06, 8, 6), '#e6b84a', [x + 0.12 * facing, y + 1.0, z + 0.38]);
  B.add('stone', G.box(0.8, 0.18, 1.6), STONE, [x + 0.35 * facing, y + 0.09, z]);
  if (wreath) {
    B.add('pine', G.tor(0.26, 0.09, 6, 14), '#2c6a3e', [x + 0.15 * facing, y + 1.55, z], [0, Math.PI / 2, 0]);
    B.add('gloss', G.sph(0.07, 6, 5), '#d42a2a', [x + 0.2 * facing, y + 1.3, z]);
  }
}
function icicles(B, x0, x1, y, z, seed = 1) {
  for (let x = x0, i = 0; x <= x1; x += 0.34, i++) { const l = 0.18 + ((Math.sin(i * 7.31 + seed) * 0.5 + 0.5) * 0.4); B.add('gloss', G.cone(0.05, l, 5), ICE, [x, y - l / 2, z], [Math.PI, 0, 0]); }
}
function bulbLine(out, a, b, step = 0.42, sag = 0, ci = 0) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(2, Math.round(d / step));
  for (let i = 0; i <= n; i++) { const t = i / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t, (i + ci) % 6]); }
}

// --- gable-to-track timber house ---
export function houseA() {
  const B = new Builder(), bulbs = [];
  const D = 5.6, W = 6.4, H = 4.4, a = 0.84, ov = 0.45, halfW = W / 2 + ov, L = halfW / Math.cos(a), rise = halfW * Math.tan(a);
  const ye = H - ov * Math.tan(a), yr = ye + rise;
  B.add('stone', G.box(D + 0.25, 0.65, W + 0.25), STONE, [0, 0.32, 0], [0, 0, 0], [1, 1, 1], [3, 0.5]);
  B.add('plaster', G.box(D, H - 0.6, W), '#ffffff', [0, 0.6 + (H - 0.6) / 2, 0], [0, 0, 0], [1, 1, 1], [2, 2]);
  const gab = G.gable(W, (W / 2) * Math.tan(a), D); B.add('plaster', gab, '#ffffff', [0, H, 0], [0, Math.PI / 2, 0]);
  for (const s of [-1, 1]) {
    const cy = (ye + yr) / 2, cz = s * halfW / 2, n = [0, Math.cos(a), s * Math.sin(a)];
    B.add('wood', G.box(D + 1.0, 0.22, L), ROOF, [0, cy, cz], [s * a, 0, 0], [1, 1, 1], [3, 3]);
    B.add('snowV', G.rbox(D + 1.15, 0.42, L + 0.12, 0.18), SNOW, [n[0] * 0.28, cy + n[1] * 0.28, cz + n[2] * 0.28], [s * a, 0, 0]);
    icicles(B, -D / 2 - 0.3, D / 2 + 0.3, ye - 0.05, s * (halfW + 0.02), s * 3);
    // gable edge bargeboards on the facade
    B.add('wood', G.box(0.14, 0.3, L), TIMBER, [D / 2 + 0.55, cy, cz], [s * a, 0, 0]);
    bulbLine(bulbs, [D / 2 + 0.66, ye + 0.05, s * (halfW - 0.05)], [D / 2 + 0.66, yr + 0.05, 0], 0.45, 0, s > 0 ? 0 : 3);
  }
  const fx = D / 2 + 0.03;
  // timber framing on the facade
  for (const z of [-W / 2 + 0.08, -0.95, 0.95, W / 2 - 0.08]) B.add('wood', G.box(0.14, H - 0.6, 0.2), TIMBER, [fx, 0.6 + (H - 0.6) / 2, z]);
  for (const y of [0.68, 2.55, H - 0.05]) B.add('wood', G.box(0.14, 0.2, W), TIMBER, [fx, y, 0]);
  for (const s of [-1, 1]) { B.add('wood', G.box(0.12, 2.3, 0.16), TIMBER, [fx, 3.45, s * 2.1], [s * 0.62, 0, 0]); }
  B.add('wood', G.box(0.14, rise * 0.85, 0.2), TIMBER, [fx, H + rise * 0.42 - 0.3, 0]);
  B.add('wood', G.box(0.14, 0.18, W * 0.62), TIMBER, [fx, H + 1.25, 0]);
  windowUnit(B, fx, 1.55, -2.05, 0.95, 1.2, '#2f6b4a');
  windowUnit(B, fx, 1.55, 2.05, 0.95, 1.2, '#2f6b4a');
  windowUnit(B, fx, 3.45, -1.55 + 0.0, 0.85, 1.05, null);
  windowUnit(B, fx, 3.45, 1.55, 0.85, 1.05, null);
  windowUnit(B, fx, H + 1.95, 0, 0.7, 0.85, null);
  door(B, fx, 0.6 - 0.6 + 0.0, 0, 1);
  // flower boxes with snow under upper windows
  for (const z of [-1.55, 1.55]) { B.add('wood', G.box(0.3, 0.22, 1.05), '#8a3b2b', [fx + 0.15, 2.82, z]); B.add('snowV', G.rbox(0.36, 0.14, 1.1, 0.06), SNOW, [fx + 0.16, 2.97, z]); }
  // side windows (visible from the chase cam at an angle)
  for (const z of [-1.4, 1.4]) { /* back side hidden */ }
  for (const x of [-1.2, 1.0]) {
    B.add('window', G.plane(0.85, 1.05), '#fff', [x, 3.45, -W / 2 - 0.03], [0, Math.PI, 0]);
    B.add('window', G.plane(0.85, 1.05), '#fff', [x, 3.45, W / 2 + 0.03], [0, 0, 0]);
    B.add('window', G.plane(0.85, 1.1), '#fff', [x, 1.6, W / 2 + 0.03], [0, 0, 0]);
    B.add('window', G.plane(0.85, 1.1), '#fff', [x, 1.6, -W / 2 - 0.03], [0, Math.PI, 0]);
  }
  // chimney
  B.add('stone', G.box(0.75, 2.6, 0.75), '#b0675a', [-1.3, yr - 0.6, -1.5], [0, 0, 0], [1, 1, 1], [0.6, 2]);
  B.add('stone', G.box(0.9, 0.18, 0.9), '#8a5248', [-1.3, yr + 0.72, -1.5]);
  B.add('snowV', G.rbox(0.95, 0.28, 0.95, 0.12), SNOW, [-1.3, yr + 0.9, -1.5]);
  return { parts: B.build(), bulbs, smoke: [[-1.3, yr + 1.1, -1.5]] };
}

// --- long-side-to-track house with dormer ---
export function houseB() {
  const B = new Builder(), bulbs = [];
  const D = 5.2, W = 8.6, H = 4.2, a = 0.74, ov = 0.5, halfD = D / 2 + ov, L = halfD / Math.cos(a), rise = halfD * Math.tan(a);
  const ye = H - ov * Math.tan(a), yr = ye + rise;
  B.add('stone', G.box(D + 0.25, 0.6, W + 0.25), STONE, [0, 0.3, 0], [0, 0, 0], [1, 1, 1], [4, 0.5]);
  B.add('plaster', G.box(D, H - 0.6, W), '#ffffff', [0, 0.6 + (H - 0.6) / 2, 0], [0, 0, 0], [1, 1, 1], [3, 2]);
  B.add('plaster', G.gable(D, (D / 2) * Math.tan(a), W), '#ffffff', [0, H, 0]);
  for (const s of [-1, 1]) {
    const cy = (ye + yr) / 2, cx = s * halfD / 2, n = [s * Math.sin(a), Math.cos(a), 0];
    B.add('wood', G.box(L, 0.22, W + 1.0), ROOF, [cx, cy, 0], [0, 0, -s * a], [1, 1, 1], [3, 3]);
    B.add('snowV', G.rbox(L + 0.12, 0.45, W + 1.15, 0.2), SNOW, [cx + n[0] * 0.3, cy + n[1] * 0.3, 0], [0, 0, -s * a]);
  }
  // icicles along the track-side eave (rotated row)
  for (let z = -W / 2 - 0.3, i = 0; z <= W / 2 + 0.3; z += 0.34, i++) { const l = 0.2 + (Math.sin(i * 5.7) * 0.5 + 0.5) * 0.45; B.add('gloss', G.cone(0.05, l, 5), ICE, [halfD + 0.02, ye - 0.06 - l / 2, z], [Math.PI, 0, 0]); }
  bulbLine(bulbs, [halfD + 0.1, ye - 0.05, -W / 2 - 0.4], [halfD + 0.1, ye - 0.05, W / 2 + 0.4], 0.42, 0, 1);
  const fx = D / 2 + 0.03;
  for (const z of [-W / 2 + 0.08, -2.2, 0, 2.2, W / 2 - 0.08]) B.add('wood', G.box(0.14, H - 0.6, 0.2), TIMBER, [fx, 0.6 + (H - 0.6) / 2, z]);
  for (const y of [0.66, 2.45, H - 0.05]) B.add('wood', G.box(0.14, 0.2, W), TIMBER, [fx, y, 0]);
  for (const zc of [-3.25, -1.1, 1.1, 3.25]) for (const s of [-1, 1]) B.add('wood', G.box(0.12, 2.0, 0.14), TIMBER, [fx, 3.3, zc], [s * 0.72, 0, 0], [1, 1, 1]);
  windowUnit(B, fx, 1.5, -3.2, 0.95, 1.15, '#a8322d');
  windowUnit(B, fx, 1.5, -1.1, 0.95, 1.15, '#a8322d');
  windowUnit(B, fx, 1.5, 3.2, 0.95, 1.15, '#a8322d');
  door(B, fx, 0, 1.1, 1);
  for (const z of [-3.25, -1.1, 1.1, 3.25]) windowUnit(B, fx + 0.0, 3.32, z, 0.75, 0.95, null);
  // dormer on the track-side slope
  const dx = 1.15, dy = H + 1.2;
  B.add('plaster', G.box(1.8, 1.5, 1.7), '#ffffff', [dx, dy, 0]);
  B.add('window', G.plane(0.8, 0.9), '#fff', [dx + 0.91, dy - 0.05, 0], [0, Math.PI / 2, 0]);
  B.add('wood', G.gable(2.0, 0.9, 2.1), ROOF, [dx + 0.1, dy + 0.75, 0], [0, Math.PI / 2, 0]);
  B.add('snowV', G.gable(2.1, 0.95, 2.15), SNOW, [dx + 0.1, dy + 0.83, 0], [0, Math.PI / 2, 0], [1, 1, 1]);
  // chimney
  B.add('stone', G.box(0.8, 2.4, 0.8), '#9a8f84', [-0.9, yr - 0.4, 2.6], [0, 0, 0], [1, 1, 1], [0.6, 2]);
  B.add('snowV', G.rbox(0.98, 0.3, 0.98, 0.12), SNOW, [-0.9, yr + 0.92, 2.6]);
  // side-wall windows
  B.add('window', G.plane(0.85, 1.05), '#fff', [0.6, 1.6, W / 2 + 0.03]);
  B.add('window', G.plane(0.7, 0.9), '#fff', [0, H + 0.9, W / 2 + 0.03]);
  B.add('window', G.plane(0.85, 1.05), '#fff', [0.6, 1.6, -W / 2 - 0.03], [0, Math.PI, 0]);
  B.add('window', G.plane(0.7, 0.9), '#fff', [0, H + 0.9, -W / 2 - 0.03], [0, Math.PI, 0]);
  return { parts: B.build(), bulbs, smoke: [[-0.9, yr + 1.1, 2.6]] };
}

// --- tall narrow townhouse with stepped gable + shop front awning ---
export function houseC() {
  const B = new Builder(), bulbs = [];
  const D = 5, W = 5, H = 6.2, a = 0.95, ov = 0.35, halfW = W / 2 + ov, L = halfW / Math.cos(a), rise = halfW * Math.tan(a);
  const ye = H - ov * Math.tan(a), yr = ye + rise;
  B.add('stone', G.box(D + 0.2, 0.5, W + 0.2), STONE, [0, 0.25, 0], [0, 0, 0], [1, 1, 1], [3, 0.4]);
  B.add('plaster', G.box(D, H - 0.5, W), '#ffffff', [0, 0.5 + (H - 0.5) / 2, 0], [0, 0, 0], [1, 1, 1], [2, 3]);
  B.add('plaster', G.gable(W, (W / 2) * Math.tan(a), D), '#ffffff', [0, H, 0], [0, Math.PI / 2, 0]);
  for (const s of [-1, 1]) {
    const cy = (ye + yr) / 2, cz = s * halfW / 2, n = [0, Math.cos(a), s * Math.sin(a)];
    B.add('wood', G.box(D + 0.7, 0.2, L), '#3d4f6b', [0, cy, cz], [s * a, 0, 0], [1, 1, 1], [3, 3]);
    B.add('snowV', G.rbox(D + 0.8, 0.36, L + 0.1, 0.15), SNOW, [0, cy + n[1] * 0.25, cz + n[2] * 0.25], [s * a, 0, 0]);
    bulbLine(bulbs, [D / 2 + 0.45, ye + 0.05, s * (halfW - 0.05)], [D / 2 + 0.45, yr + 0.05, 0], 0.42, 0, 2);
  }
  const fx = D / 2 + 0.03;
  // shop front: big window + awning
  B.add('wood', G.box(0.2, 2.4, W - 0.2), '#5a2e1d', [fx, 1.7, 0]);
  B.add('window', G.plane(2.6, 1.6), '#fff', [fx + 0.09, 1.65, -0.7], [0, Math.PI / 2, 0]);
  door(B, fx + 0.06, 0.5, 1.65, 1, false);
  B.add('stripes', G.box(1.3, 0.08, W + 0.2), '#fff', [fx + 0.62, 3.05, 0], [0, 0, -0.35], [1, 1, 1], [1, 6]);
  B.add('snowV', G.rbox(1.25, 0.14, W + 0.15, 0.06), SNOW, [fx + 0.6, 3.14, 0], [0, 0, -0.35]);
  for (const z of [-1.3, 1.3]) { windowUnit(B, fx, 4.0, z, 0.8, 1.15, '#2b4c7e'); windowUnit(B, fx, 5.55 - 0.1, z, 0.7, 0.9, null); }
  windowUnit(B, fx, H + 1.3, 0, 0.6, 0.8, null);
  B.add('wood', G.box(0.14, 0.2, W), TIMBER, [fx, 3.35, 0]);
  // hanging shop sign
  B.add('metal', G.box(0.06, 0.06, 0.9), IRON, [fx + 0.45, 3.9, -2.2]);
  B.add('wood', G.rbox(0.08, 0.6, 0.7, 0.05), '#e7b347', [fx + 0.8, 3.5, -2.2]);
  B.add('stone', G.box(0.7, 2.0, 0.7), '#a0968b', [-1.2, yr - 0.3, 1.0]);
  B.add('snowV', G.rbox(0.85, 0.28, 0.85, 0.1), SNOW, [-1.2, yr + 0.75, 1.0]);
  for (const x of [-1.2, 0.8]) for (const y of [1.6, 4.0]) { B.add('window', G.plane(0.8, 1.0), '#fff', [x, y, W / 2 + 0.03]); B.add('window', G.plane(0.8, 1.0), '#fff', [x, y, -W / 2 - 0.03], [0, Math.PI, 0]); }
  return { parts: B.build(), bulbs, smoke: [[-1.2, yr + 0.95, 1.0]] };
}

// --- log cabin (forest) ---
export function cabin() {
  const B = new Builder(), bulbs = [];
  const D = 4.4, W = 5.2, H = 2.7, a = 0.7, ov = 0.5, halfW = W / 2 + ov, L = halfW / Math.cos(a), rise = halfW * Math.tan(a), ye = H - ov * Math.tan(a), yr = ye + rise;
  for (let y = 0.2; y < H; y += 0.36) {
    B.add('bark', G.cyl(0.19, 0.19, W + 0.5, 8), '#9a6a44', [D / 2, y, 0], [Math.PI / 2, 0, 0], [1, 1, 1], [1, 3]);
    B.add('bark', G.cyl(0.19, 0.19, W + 0.5, 8), '#8d5f3c', [-D / 2, y, 0], [Math.PI / 2, 0, 0], [1, 1, 1], [1, 3]);
    B.add('bark', G.cyl(0.19, 0.19, D + 0.5, 8), '#93653f', [0, y + 0.18, W / 2], [0, 0, Math.PI / 2], [1, 1, 1], [1, 3]);
    B.add('bark', G.cyl(0.19, 0.19, D + 0.5, 8), '#93653f', [0, y + 0.18, -W / 2], [0, 0, Math.PI / 2], [1, 1, 1], [1, 3]);
  }
  B.add('wood', G.box(D - 0.2, H, W - 0.2), '#7a5032', [0, H / 2, 0]);
  B.add('wood', G.gable(W, (W / 2) * Math.tan(a), D), '#8a5a38', [0, H, 0], [0, Math.PI / 2, 0], [1, 1, 1], [2, 2]);
  for (const s of [-1, 1]) {
    const cy = (ye + yr) / 2, cz = s * halfW / 2, n = [0, Math.cos(a), s * Math.sin(a)];
    B.add('wood', G.box(D + 1.0, 0.2, L), '#5b3a26', [0, cy, cz], [s * a, 0, 0]);
    B.add('snowV', G.rbox(D + 1.2, 0.5, L + 0.15, 0.22), SNOW, [0, cy + n[1] * 0.32, cz + n[2] * 0.32], [s * a, 0, 0]);
    icicles(B, -D / 2 - 0.4, D / 2 + 0.4, ye - 0.05, s * (halfW + 0.02), s);
  }
  windowUnit(B, D / 2 + 0.2, 1.4, -1.3, 0.85, 0.9, '#2f6b4a');
  door(B, D / 2 + 0.2, 0, 1.0, 1);
  B.add('stone', G.box(0.8, 2.2, 0.8), '#8f8a85', [-0.8, yr - 0.2, -1.2]);
  B.add('snowV', G.rbox(0.95, 0.28, 0.95, 0.1), SNOW, [-0.8, yr + 0.95, -1.2]);
  bulbLine(bulbs, [D / 2 + 0.75, ye, -halfW], [D / 2 + 0.75, yr, 0], 0.45, 0, 0);
  bulbLine(bulbs, [D / 2 + 0.75, yr, 0], [D / 2 + 0.75, ye, halfW], 0.45, 0, 3);
  return { parts: B.build(), bulbs, smoke: [[-0.8, yr + 1.1, -1.2]] };
}

// --- snow-laden pine ---
export function pine(tiers = 4, seed = 1) {
  const B = new Builder();
  const dark = lin('#1f5a3f'), mid = lin('#2f7a52'), snow = lin('#f4f8ff'), snowS = lin('#cfdcf2');
  let y = 0.6, r = 1.75, h = 1.7;
  B.add('bark', G.cyl(0.14, 0.22, 1.4, 7), '#6b4329', [0, 0.6, 0]);
  for (let t = 0; t < tiers; t++) {
    const rs = 11; let g = new THREE.ConeGeometry(r, h, rs, 3, true);
    g = g.toNonIndexed(); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), ang = Math.atan2(vz, vx), k = (vy + h / 2) / h; // 0 rim .. 1 apex
      const spike = 1 + 0.16 * Math.sin(ang * rs + seed + t) ;
      const droop = k < 0.05 ? -0.22 * (0.5 + 0.5 * Math.sin(ang * rs + t * 2.0 + seed)) : 0;
      p.setXYZ(i, vx * spike, vy + droop, vz * spike);
    }
    g.computeVertexNormals();
    g = paint(g, (x, yy, z) => {
      const k = (yy + h / 2) / h, ang = Math.atan2(z, x); const edge = 0.32 + 0.14 * Math.sin(ang * 5 + t * 3 + seed) + 0.08 * Math.sin(ang * 13 + seed);
      if (k > edge) return k > edge + 0.12 ? snow : snowS;
      return k < 0.05 ? dark : mid;
    });
    g.translate(0, y + h / 2, 0); B.addRaw('pine', g);
    // underside (dark) disc to hide open cone
    const u = paint(new THREE.CircleGeometry(r * 0.98, rs).toNonIndexed(), () => dark); u.rotateX(Math.PI / 2); u.translate(0, y + 0.02, 0); u.deleteAttribute('uv'); u.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(u.attributes.position.count * 2), 2)); B.addRaw('pine', u);
    y += h * 0.55; r *= 0.74; h *= 0.86;
  }
  const top = paint(new THREE.ConeGeometry(r * 0.9, h * 0.9, 8, 1).toNonIndexed(), () => snow); top.translate(0, y + h * 0.45, 0); B.addRaw('pine', top);
  return { parts: B.build() };
}

export function rock(seed = 1) {
  const B = new Builder();
  let g = jitter(new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), 0.35, seed);
  g = paint(g, (x, y, z, nx, ny) => ny > 0.45 ? lin('#f4f8ff') : ny > 0.2 ? lin('#c9d3e3') : lin('#77808f'));
  g.scale(1.3, 0.8, 1.1); B.addRaw('paint', g);
  return { parts: B.build() };
}

export function lampPost() {
  const B = new Builder(), bulbs = [];
  B.add('metal', G.cyl(0.2, 0.26, 0.4, 10), IRON, [0, 0.2, 0]);
  B.add('metal', G.cyl(0.07, 0.09, 4.4, 8), IRON, [0, 2.4, 0]);
  B.add('metal', G.sph(0.11, 8, 6), '#d9a93c', [0, 4.65, 0]);
  B.add('metal', G.tube([[0, 4.1, 0], [0.3, 4.35, 0], [0.62, 4.3, 0], [0.75, 4.0, 0]], 0.035, 16, 5), IRON);
  // lantern
  B.add('metal', G.cone(0.26, 0.24, 4), IRON, [0.75, 3.88, 0], [0, Math.PI / 4, 0]);
  B.add('lamp', G.cyl(0.13, 0.1, 0.36, 6), '#fff', [0.75, 3.58, 0]);
  B.add('metal', G.cyl(0.14, 0.12, 0.06, 6), IRON, [0.75, 3.38, 0]);
  B.add('snowV', G.sph(0.17, 8, 5), SNOW, [0.75, 4.0, 0], [0, 0, 0], [1, 0.5, 1]);
  B.add('snowV', G.sph(0.12, 8, 5), SNOW, [0, 4.75, 0], [0, 0, 0], [1, 0.6, 1]);
  // candy-cane wrap ribbon + wreath
  B.add('pine', G.tor(0.22, 0.08, 6, 12), '#2c6a3e', [0.1, 2.6, 0], [0, Math.PI / 2, 0]);
  B.add('gloss', G.sph(0.07, 6, 5), '#d42a2a', [0.18, 2.4, 0]);
  return { parts: B.build(), bulbs, halo: [[0.75, 3.58, 0]] };
}

// wire spanning the track between two lamp posts at x=±XP, with bunting pennants
export const XP = TRACK_HALF + 1.0;
export function wireSpan() {
  const B = new Builder(), bulbs = [];
  const top = 4.45, pts = [], pts2 = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16, x = -XP + 2 * XP * t; pts.push([x, top - Math.sin(t * Math.PI) * 0.75, 0]); pts2.push([x, top - 0.1 - Math.sin(t * Math.PI) * 1.05, 0.25]); }
  B.add('metal', G.tube(pts, 0.022, 32, 4), '#1d1f26');
  B.add('metal', G.tube(pts2, 0.02, 32, 4), '#1d1f26');
  const cols = ['#e83a3a', '#ffd23f', '#2fb47c', '#3a7bd5', '#ffffff', '#ff7bc0'];
  for (let i = 1; i < 18; i++) {
    const t = i / 18, x = -XP + 2 * XP * t, y = top - Math.sin(t * Math.PI) * 0.75;
    const tri = new THREE.BufferGeometry(); const v = new Float32Array([-0.18, 0, 0, 0.18, 0, 0, 0, -0.42, 0.0]);
    tri.setAttribute('position', new THREE.BufferAttribute(v, 3)); tri.computeVertexNormals();
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
    B.add('banner', tri, cols[i % 6], [x, y, 0], [0, 0, (t - 0.5) * 0.25]);
  }
  for (let i = 0; i <= 24; i++) { const t = i / 24; bulbs.push([-XP + 2 * XP * t, top - 0.1 - Math.sin(t * Math.PI) * 1.05 - 0.08, 0.25, i % 6]); }
  return { parts: B.build(), bulbs };
}

export function fence() {
  const B = new Builder();
  for (const z of [0, -2, -4]) { B.add('wood', G.box(0.14, 1.1, 0.14), '#8b5a36', [0, 0.55, z]); B.add('snowV', G.sph(0.11, 6, 4), SNOW, [0, 1.12, z], [0, 0, 0], [1, 0.7, 1]); }
  for (const y of [0.45, 0.85]) B.add('wood', G.box(0.08, 0.14, 4.1), '#9a6a40', [0.05, y, -2], [0, 0, 0], [1, 1, 1], [1, 2]);
  B.add('snowV', G.rbox(0.18, 0.12, 4.1, 0.05), SNOW, [0.05, 0.97, -2]);
  return { parts: B.build() };
}
export function bench() {
  const B = new Builder();
  for (const z of [-0.7, 0.7]) { B.add('metal', G.box(0.5, 0.45, 0.06), IRON, [0, 0.22, z]); B.add('metal', G.box(0.06, 0.6, 0.06), IRON, [-0.24, 0.6, z]); }
  for (let i = 0; i < 3; i++) B.add('wood', G.box(0.14, 0.05, 1.7), '#a0663a', [-0.16 + i * 0.16, 0.47, 0]);
  for (let i = 0; i < 2; i++) B.add('wood', G.box(0.04, 0.12, 1.7), '#a0663a', [-0.26, 0.68 + i * 0.18, 0]);
  B.add('snowV', G.rbox(0.48, 0.12, 1.6, 0.05), SNOW, [0, 0.55, 0]);
  return { parts: B.build() };
}
export function presents() {
  const B = new Builder();
  const P = [[0, 0.3, 0, 0.6, '#d93636'], [0.55, 0.22, 0.2, 0.44, '#2e9e5b'], [0.1, 0.78, 0.05, 0.36, '#3a6fd8'], [-0.4, 0.2, -0.45, 0.4, '#f2b32e'], [0.35, 0.18, -0.5, 0.36, '#9c4fd6']];
  for (const [x, y, z, s, c] of P) {
    B.add('wrap', G.box(s, s, s), c, [x, y, z], [0, x * 2, 0]);
    B.add('paint', G.box(s * 1.02, s * 1.02, s * 0.16), '#ffe27a', [x, y, z], [0, x * 2, 0]);
    B.add('paint', G.box(s * 0.16, s * 1.02, s * 1.02), '#ffe27a', [x, y, z], [0, x * 2, 0]);
  }
  B.add('snowV', G.rbox(0.62, 0.08, 0.62, 0.03), SNOW, [0, 0.62, 0]);
  return { parts: B.build() };
}
export function decoSnowman() {
  const B = new Builder();
  B.add('snowV', G.sph(0.7, 16, 12), SNOW, [0, 0.6, 0]); B.add('snowV', G.sph(0.5, 16, 12), SNOW, [0, 1.55, 0]); B.add('snowV', G.sph(0.36, 14, 10), SNOW, [0, 2.25, 0]);
  B.add('gloss', G.cone(0.07, 0.4, 8), '#ff7a1a', [0.38, 2.25, 0], [0, 0, -Math.PI / 2]);
  B.add('gloss', G.cyl(0.26, 0.26, 0.38, 14), '#1d1f2b', [0, 2.67, 0]); B.add('gloss', G.cyl(0.4, 0.4, 0.04, 16), '#1d1f2b', [0, 2.5, 0]); B.add('gloss', G.cyl(0.27, 0.27, 0.08, 14), '#c62f2f', [0, 2.54, 0]);
  for (const z of [-0.12, 0.12]) B.add('gloss', G.sph(0.045, 6, 5), '#111', [0.32, 2.34, z]);
  B.add('paint', G.tor(0.38, 0.09, 6, 16), '#2f9bd6', [0, 1.95, 0], [Math.PI / 2, 0, 0]);
  B.add('bark', G.cyl(0.03, 0.03, 1.1, 5), '#5b3a22', [0, 1.65, 0.75], [0.9, 0, 0]);
  B.add('bark', G.cyl(0.03, 0.03, 1.1, 5), '#5b3a22', [0, 1.65, -0.75], [-0.9, 0, 0]);
  return { parts: B.build() };
}
export function stall() {
  const B = new Builder(), bulbs = [];
  for (const z of [-1.4, 1.4]) for (const x of [-0.8, 0.8]) B.add('wood', G.box(0.14, 2.6, 0.14), '#7a4a2a', [x, 1.3, z]);
  B.add('wood', G.box(1.2, 1.0, 3.0), '#9a6438', [0.3, 0.5, 0], [0, 0, 0], [1, 1, 1], [1, 2]);
  B.add('wood', G.box(1.4, 0.08, 3.2), '#6b4126', [0.35, 1.04, 0]);
  B.add('stripes', G.box(2.2, 0.08, 3.4), '#fff', [0.1, 2.7, 0], [0, 0, -0.3], [1, 1, 1], [1, 4]);
  B.add('snowV', G.rbox(2.1, 0.18, 3.3, 0.08), SNOW, [0.08, 2.81, 0], [0, 0, -0.3]);
  for (let i = 0; i < 5; i++) B.add('wrap', G.box(0.28, 0.28, 0.28), ['#d93636', '#2e9e5b', '#3a6fd8', '#f2b32e', '#9c4fd6'][i], [0.5, 1.22, -1.1 + i * 0.55], [0, i, 0]);
  for (let i = 0; i < 3; i++) B.add('lamp', G.sph(0.1, 8, 6), '#fff', [1.0, 2.25, -1 + i]);
  bulbLine(bulbs, [1.2, 2.35, -1.7], [1.2, 2.35, 1.7], 0.32, 0.15, 0);
  return { parts: B.build(), bulbs, halo: [[1.0, 2.25, -1], [1.0, 2.25, 1]] };
}
export function bigTree() {
  const t = pine(6, 3.3), bulbs = [];
  for (let i = 0; i < 90; i++) { const k = i / 90, a = k * Math.PI * 2 * 6, y = 0.9 + k * 6.6, r = 1.85 * (1 - k * 0.85) + 0.1; bulbs.push([Math.cos(a) * r, y, Math.sin(a) * r, i % 6]); }
  const B = new Builder();
  const s = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 + Math.PI / 2, rr = k % 2 ? 0.16 : 0.4; s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const sg = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false }); sg.translate(0, 0, -0.05);
  B.add('lamp', sg, '#ffd23f', [0, 7.75, 0], [0, Math.PI / 2, 0]);
  for (const k in t.parts) B.addRaw(k, t.parts[k]);
  return { parts: B.build(), bulbs, halo: [[0, 7.75, 0]] };
}
export function barrels() {
  const B = new Builder();
  for (const [x, z, y] of [[0, 0, 0], [0.7, 0.3, 0], [0.35, 0.15, 0.95]]) {
    B.add('wood', G.cyl(0.36, 0.36, 0.9, 12), '#8a5a34', [x, y + 0.45, z], [0, 0, 0], [1, 1, 1], [2, 1]);
    for (const yy of [0.15, 0.75]) B.add('metal', G.cyl(0.375, 0.375, 0.06, 12), IRON, [x, y + yy, z]);
  }
  B.add('snowV', G.sph(0.33, 10, 6), SNOW, [0.35, 1.85, 0.15], [0, 0, 0], [1, 0.35, 1]);
  return { parts: B.build() };
}

// --- track + ground pieces (one chunk long, z from 0 to -CHUNK) ---
function strip(xs, ys, segZ, mat, colorFn, uFn, vScale, B, noise) {
  const nx = xs.length, nz = segZ + 1, pos = [], uv = [], col = [], idx = [];
  for (let j = 0; j < nz; j++) { const z = -CHUNK * j / segZ; for (let i = 0; i < nx; i++) { const n = noise ? noise(xs[i], z) : 0; pos.push(xs[i], ys[i] + n, z); uv.push(uFn(xs[i]), -z / vScale); const c = colorFn(xs[i], ys[i] + n); col.push(c[0], c[1], c[2]); } }
  for (let j = 0; j < segZ; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  g = g.toNonIndexed(); B.addRaw(mat, g);
}
export function trackPiece() {
  const B = new Builder(), W = TRACK_HALF + 0.5, xs = [];
  for (let i = 0; i <= 12; i++) xs.push(-W + 2 * W * i / 12);
  strip(xs, xs.map(() => 0), 16, 'track', () => [1, 1, 1], x => (x + W) / (2 * W), CHUNK / 3, B);
  // log curbs along both edges
  for (const s of [-1, 1]) B.add('bark', G.cyl(0.2, 0.2, CHUNK, 8, false), '#8a5a3a', [s * (W + 0.05), 0.12, -CHUNK / 2], [Math.PI / 2, 0, 0], [1, 1, 1], [1, 8]);
  for (const s of [-1, 1]) B.add('snowV', G.cyl(0.16, 0.16, CHUNK, 6, false), '#ffffff', [s * (W + 0.05), 0.3, -CHUNK / 2], [Math.PI / 2, 0, 0], [1.05, 1, 0.6]);
  return { parts: B.build() };
}
const hn = (x, z) => Math.sin(x * 0.37 + z * 0.21) * Math.cos(x * 0.13 - z * 0.29);
export function groundPiece(kind = 'village') {
  const B = new Builder(), xs = [], ys = [];
  const W = TRACK_HALF + 0.5;
  const prof = kind === 'river' ? [[W + 0.2, -0.1], [W + 2, 0.6], [16, 0.7], [19, 1.6], [70, 2.4]] : [[W + 0.2, 0.15], [W + 0.7, 0.55], [W + 1.6, 0.6], [8, 0.42], [14, 0.4], [30, 0.9], [70, 2.6]];
  for (const s of [-1, 1]) {
    const xs1 = [], ys1 = [];
    for (const [x, y] of prof) { xs1.push(s * x); ys1.push(y); }
    // densify
    const dx = [], dy = [];
    for (let i = 0; i < xs1.length - 1; i++) { const n = Math.max(1, Math.round(Math.abs(xs1[i + 1] - xs1[i]) / 2.5)); for (let k = 0; k < n; k++) { const t = k / n; dx.push(xs1[i] + (xs1[i + 1] - xs1[i]) * t); dy.push(ys1[i] + (ys1[i + 1] - ys1[i]) * t); } }
    dx.push(xs1[xs1.length - 1]); dy.push(ys1[ys1.length - 1]);
    if (s < 0) { dx.reverse(); dy.reverse(); }
    const blue = [0.86, 0.9, 1.0];
    strip(dx, dy, 10, 'snowV', (x, y) => { const k = Math.min(1, Math.abs(x) / 30); return [0.97 - k * 0.04, 0.98 - k * 0.03, 1.0]; }, x => x / 6, 6, B, (x, z) => Math.abs(x) > 9 ? hn(x, z) * Math.min(1, (Math.abs(x) - 9) / 6) * 0.5 : 0);
  }
  if (kind === 'river') {
    // frozen river surface on both sides under the bridge
    B.add('river', G.box(140, 0.2, CHUNK), '#ffffff', [0, -2.6, -CHUNK / 2], [0, 0, 0], [1, 1, 1], [12, 4]);
  }
  return { parts: B.build() };
}
// bridge deck: planks over the track + railings + stone piers
export function bridge() {
  const B = new Builder(), W = TRACK_HALF + 0.5;
  B.add('wood', G.box(2 * W + 1.2, 0.4, CHUNK), '#8a5a36', [0, -0.21, -CHUNK / 2], [0, 0, 0], [1, 1, 1], [3, 14]);
  for (const s of [-1, 1]) {
    for (let z = -1; z > -CHUNK; z -= 2.5) { B.add('wood', G.box(0.2, 1.2, 0.2), '#6b4226', [s * (W + 0.45), 0.6, z]); B.add('snowV', G.sph(0.15, 6, 4), '#fff', [s * (W + 0.45), 1.22, z], [0, 0, 0], [1, 0.6, 1]); }
    B.add('wood', G.box(0.16, 0.16, CHUNK), '#7a4d2c', [s * (W + 0.45), 1.12, -CHUNK / 2], [0, 0, 0], [1, 1, 1], [1, 10]);
    B.add('wood', G.box(0.12, 0.12, CHUNK), '#7a4d2c', [s * (W + 0.45), 0.6, -CHUNK / 2]);
    B.add('snowV', G.rbox(0.26, 0.14, CHUNK, 0.06), '#fff', [s * (W + 0.45), 1.25, -CHUNK / 2]);
    B.add('wood', G.box(0.5, 0.5, CHUNK), '#5e3b22', [s * (W + 0.35), -0.6, -CHUNK / 2]);
  }
  for (const z of [-8, -28]) {
    B.add('stone', G.box(2 * W + 2, 2.6, 2.2), '#a8a29c', [0, -1.9, z], [0, 0, 0], [1, 1, 1], [3, 1]);
    B.add('snowV', G.rbox(2 * W + 2.2, 0.3, 2.4, 0.1), '#fff', [0, -0.5, z]);
  }
  return { parts: B.build() };
}
// tunnel shell: rock mass with stone arch portal and timber frames inside
export function tunnel() {
  const B = new Builder(), bulbs = [], W = TRACK_HALF + 1.2, Ht = 5.6;
  for (const s of [-1, 1]) B.add('stone', G.box(1.2, Ht, CHUNK), '#8e8a86', [s * (W + 0.6), Ht / 2, -CHUNK / 2], [0, 0, 0], [1, 1, 1], [12, 2]);
  B.add('stone', G.box(2 * W + 2.4, 1.0, CHUNK), '#7d7a77', [0, Ht + 0.5, -CHUNK / 2], [0, 0, 0], [1, 1, 1], [3, 12]);
  // rock mass over the top (jittered)
  let rg = jitter(new THREE.BoxGeometry(2 * W + 16, 9, CHUNK + 0.5, 8, 4, 10).toNonIndexed(), 0.9, 9);
  rg = paint(rg, (x, y, z, nx, ny) => ny > 0.5 ? lin('#f4f8ff') : lin('#7c8594')); rg.translate(0, Ht + 5.4, -CHUNK / 2); B.addRaw('paint', rg);
  for (let z = -2; z > -CHUNK; z -= 6) {
    for (const s of [-1, 1]) B.add('wood', G.box(0.4, Ht, 0.4), '#6b4226', [s * W, Ht / 2, z]);
    B.add('wood', G.box(2 * W + 0.4, 0.45, 0.45), '#6b4226', [0, Ht - 0.2, z]);
    for (const s of [-1, 1]) { B.add('lamp', G.cyl(0.12, 0.1, 0.3, 6), '#fff', [s * (W - 0.35), 3.4, z]); B.add('metal', G.box(0.2, 0.06, 0.06), IRON, [s * (W - 0.15), 3.4, z]); }
  }
  // portal arch at the entrance (z=0)
  B.add('stone', G.box(2 * W + 3, 1.6, 1.2), '#a9a39c', [0, Ht + 0.6, 0.2], [0, 0, 0], [1, 1, 1], [4, 1]);
  for (const s of [-1, 1]) B.add('stone', G.box(1.6, Ht, 1.2), '#a9a39c', [s * (W + 0.8), Ht / 2, 0.2], [0, 0, 0], [1, 1, 1], [1, 3]);
  B.add('snowV', G.rbox(2 * W + 3.4, 0.5, 1.6, 0.2), '#fff', [0, Ht + 1.5, 0.2]);
  return { parts: B.build(), bulbs, halo: [] };
}
