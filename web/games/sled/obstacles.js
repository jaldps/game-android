// Obstacles, coins, power-ups (instanced visuals + gameplay data) and the fair pattern generator.
import * as THREE from 'three';
import { Builder, G, Prefab, paint } from './geom.js';
import { M, TEX } from './materials.js';
import { curved } from './render.js';
import { LANES, LANE_W, COIN_SPACING, KITE_Y } from './config.js';

const SNOW = '#ffffff', IRON = '#2b2f3a';
// ---------- obstacle art ----------
function artLow() {
  const B = new Builder();
  for (const s of [-1, 1]) { B.add('paint', G.box(0.16, 1.08, 0.16), '#7a2a22', [s * 0.86, 0.54, 0]); B.add('snowV', G.rbox(0.26, 0.14, 0.26, 0.06), SNOW, [s * 0.86, 1.12, 0]); B.add('paint', G.box(0.34, 0.08, 0.5), '#5a1f18', [s * 0.86, 0.04, 0]); }
  B.add('stripes', G.box(1.86, 0.3, 0.1), '#fff', [0, 0.84, 0], [0, 0, 0], [1, 1, 1], [3, 1]);
  B.add('stripes', G.box(1.86, 0.22, 0.1), '#fff', [0, 0.42, 0], [0, 0, 0], [1, 1, 1], [3, 1]);
  B.add('snowV', G.rbox(1.7, 0.1, 0.16, 0.04), SNOW, [0, 1.02, 0]);
  B.add('lamp', G.cyl(0.08, 0.07, 0.18, 6), '#fff', [-0.86, 1.3, 0]); B.add('metal', G.cone(0.12, 0.12, 6), IRON, [-0.86, 1.45, 0]);
  B.add('gloss', G.cyl(0.18, 0.18, 0.04, 16), '#ffd23f', [0, 0.84, 0.07], [Math.PI / 2, 0, 0]);
  B.add('gloss', G.box(0.06, 0.2, 0.02), '#d42a2a', [0, 0.84, 0.095]);
  return B.build();
}
function artLog() {
  const B = new Builder();
  B.add('bark', G.cyl(0.43, 0.46, 1.95, 12), '#9a6a44', [0, 0.43, 0], [0, 0, Math.PI / 2], [1, 1, 1], [3, 1]);
  for (const s of [-1, 1]) { B.add('paint', G.cyl(0.38, 0.38, 0.02, 14), '#e7c99a', [s * 0.99, 0.43, 0], [0, 0, Math.PI / 2]); B.add('paint', G.cyl(0.22, 0.22, 0.025, 12), '#c9a06a', [s * 0.99, 0.43, 0], [0, 0, Math.PI / 2]); }
  B.add('snowV', G.rbox(1.8, 0.2, 0.55, 0.09), SNOW, [0, 0.86, 0]);
  B.add('bark', G.cyl(0.08, 0.08, 1.1, 6), '#6b4329', [0.6, 0.3, 0.35], [0.4, 0, 0.2]);
  B.add('pine', G.cone(0.18, 0.4, 6), '#2f7a52', [-0.45, 0.95, 0.1], [0, 0, 1.2]);
  return B.build();
}
function artHigh() {
  const B = new Builder();
  for (const s of [-1, 1]) { B.add('stripes', G.cyl(0.11, 0.11, 3.0, 12), '#fff', [s * 0.96, 1.5, 0], [0, 0, 0], [1, 1, 1], [1, 6]); B.add('gloss', G.sph(0.16, 10, 8), '#ffd23f', [s * 0.96, 3.08, 0]); }
  B.add('banner', G.box(1.86, 0.95, 0.06), '#fff', [0, 1.82, 0]);
  B.add('pine', G.cyl(0.13, 0.13, 2.0, 8), '#2c6a3e', [0, 2.38, 0], [0, 0, Math.PI / 2]);
  B.add('snowV', G.rbox(1.95, 0.1, 0.22, 0.04), SNOW, [0, 2.5, 0]);
  for (let i = -2; i <= 2; i++) { B.add('metal', G.sph(0.09, 8, 6), '#ffc93a', [i * 0.38, 1.27, 0.04]); B.add('metal', G.cyl(0.01, 0.01, 0.1, 4), '#333', [i * 0.38, 1.33, 0.04]); }
  for (let i = -3; i <= 3; i++) B.add('gloss', G.sph(0.06, 6, 5), ['#d42a2a', '#ffd23f', '#2e8bd6'][(i + 3) % 3], [i * 0.27, 2.32, 0.13]);
  B.add('lamp', G.sph(0.14, 10, 8), '#fff', [0, 2.75, 0]);
  return B.build();
}
function artSnowman() {
  const B = new Builder();
  B.add('snowV', G.sph(0.78, 18, 14), SNOW, [0, 0.66, 0]); B.add('snowV', G.sph(0.56, 18, 14), SNOW, [0, 1.68, 0]); B.add('snowV', G.sph(0.4, 16, 12), SNOW, [0, 2.42, 0]);
  B.add('gloss', G.cone(0.08, 0.45, 8), '#ff7a1a', [0, 2.42, 0.45], [Math.PI / 2, 0, 0]);
  B.add('gloss', G.cyl(0.29, 0.29, 0.42, 14), '#1d1f2b', [0, 2.88, 0]); B.add('gloss', G.cyl(0.45, 0.45, 0.05, 16), '#1d1f2b', [0, 2.69, 0]); B.add('gloss', G.cyl(0.3, 0.3, 0.09, 14), '#c62f2f', [0, 2.74, 0]);
  for (const x of [-0.13, 0.13]) B.add('gloss', G.sph(0.05, 6, 5), '#111', [x, 2.52, 0.35]);
  for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; B.add('gloss', G.sph(0.03, 5, 4), '#111', [Math.sin(a) * 0.22, 2.3 - Math.cos(a) * 0.08 + 0.05, 0.37]); }
  for (let i = 0; i < 3; i++) B.add('gloss', G.sph(0.055, 6, 5), '#222', [0, 1.95 - i * 0.25, 0.52 - Math.abs(i - 1) * 0.02]);
  B.add('paint', G.tor(0.42, 0.11, 8, 18), '#2f9bd6', [0, 2.1, 0], [Math.PI / 2, 0, 0]);
  B.add('paint', G.box(0.2, 0.55, 0.06), '#2f9bd6', [0.25, 1.82, 0.38], [0.2, 0, 0.15]);
  for (const s of [-1, 1]) B.add('bark', G.cyl(0.035, 0.03, 1.1, 5), '#5b3a22', [s * 0.85, 1.95, 0], [0, 0, s * -1.0]);
  return B.build();
}
function artIce() {
  const B = new Builder();
  for (const [x, y, s, r] of [[-0.45, 0.45, 0.9, 0.1], [0.45, 0.45, 0.9, -0.08], [0, 1.32, 0.85, 0.3]]) B.add('ice', G.rbox(s, s, s, 0.08), '#fff', [x, y, 0], [0, r, 0]);
  B.add('snowV', G.rbox(0.8, 0.14, 0.8, 0.06), SNOW, [0, 1.8, 0], [0, 0.3, 0]);
  B.add('snowV', G.rbox(1.95, 0.12, 0.95, 0.05), SNOW, [0, 0.94, 0]);
  return B.build();
}
const CART_L = 7.6, CART_TOP = 2.3;
function artCart(loco = false) {
  const B = new Builder(), L = CART_L, h = CART_TOP;
  // runners
  for (const s of [-1, 1]) {
    B.add('metal', G.tube([[s * 0.7, 0.12, -L / 2 + 0.2], [s * 0.7, 0.1, 0], [s * 0.7, 0.12, L / 2 - 0.5], [s * 0.7, 0.45, L / 2 + 0.1], [s * 0.7, 0.75, L / 2 - 0.1]], 0.07, 24, 6), loco ? '#ffcf3d' : '#d9a33a');
    for (let z = -L / 2 + 0.8; z < L / 2 - 0.4; z += 1.6) B.add('metal', G.box(0.1, 0.5, 0.12), IRON, [s * 0.7, 0.35, z]);
  }
  B.add('paint', G.box(1.7, 0.18, L - 0.2), '#3a2a22', [0, 0.6, 0]);
  // body: painted with plank sides
  B.add('plaster', G.rbox(1.82, h - 0.75, L - 0.3, 0.1), '#ffffff', [0, 0.7 + (h - 0.75) / 2, 0]);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) B.add('wood', G.box(0.04, 0.3, L - 0.6), '#c08a5a', [s * 0.92, 0.95 + i * 0.36, 0], [0, 0, 0], [1, 1, 1], [5, 1]);
  for (const s of [-1, 1]) B.add('metal', G.box(0.06, 0.1, L - 0.25), '#ffcf3d', [s * 0.93, h - 0.12, 0]);
  // top: snowy tarp (rideable)
  B.add('paint', G.rbox(1.86, 0.14, L - 0.2, 0.06), loco ? '#2b2f52' : '#2f5a3e', [0, h - 0.02, 0]);
  B.add('snowV', G.rbox(1.6, 0.12, L - 0.6, 0.06), SNOW, [0, h + 0.08, 0]);
  // front face (+Z, toward the player)
  const fz = L / 2 - 0.15;
  if (loco) {
    B.add('paint', G.rbox(1.9, 1.5, 0.3, 0.12), '#2b2f52', [0, 1.45, fz + 0.1]);
    B.add('lamp', G.cyl(0.32, 0.32, 0.12, 18), '#fff', [0, 1.65, fz + 0.3], [Math.PI / 2, 0, 0]);
    B.add('metal', G.tor(0.34, 0.06, 6, 18), '#ffcf3d', [0, 1.65, fz + 0.33]);
    for (const s of [-1, 1]) B.add('lamp', G.sph(0.1, 8, 6), '#fff', [s * 0.65, 1.05, fz + 0.27]);
    // plow (cowcatcher)
    const plow = new THREE.ConeGeometry(0.95, 0.9, 4, 1); plow.rotateX(Math.PI / 2); plow.rotateZ(Math.PI / 4); plow.scale(1.1, 0.6, 1);
    B.add('metal', plow, '#c43a2e', [0, 0.45, fz + 0.55]);
    B.add('stone', G.cyl(0.2, 0.26, 0.7, 10), '#333744', [0, h + 0.4, fz - 0.8]);
    B.add('metal', G.cyl(0.3, 0.2, 0.18, 10), '#ffcf3d', [0, h + 0.8, fz - 0.8]);
  } else {
    B.add('wood', G.box(1.86, 1.4, 0.12), '#8a5532', [0, 1.4, fz + 0.06], [0, 0, 0], [1, 1, 1], [2, 2]);
    for (const s of [-1, 1]) { B.add('lamp', G.cyl(0.11, 0.1, 0.24, 6), '#fff', [s * 0.72, 2.0, fz + 0.22]); B.add('metal', G.cone(0.15, 0.14, 6), IRON, [s * 0.72, 2.2, fz + 0.22]); }
    B.add('pine', G.tor(0.3, 0.1, 6, 14), '#2c6a3e', [0, 1.45, fz + 0.16]); B.add('gloss', G.sph(0.09, 6, 5), '#d42a2a', [0, 1.18, fz + 0.2]);
    B.add('metal', G.box(1.9, 0.1, 0.14), '#ffcf3d', [0, 0.72, fz + 0.1]);
  }
  // rear face
  B.add('wood', G.box(1.86, 1.4, 0.1), '#7a4a2c', [0, 1.4, -L / 2 + 0.12]);
  return B.build();
}
function artRamp() {
  const B = new Builder(), L = 4.6, h = CART_TOP;
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(L, 0); s.lineTo(L, h); s.lineTo(0, 0.02);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.8, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-0.9, 0, L);
  // after rotation the wedge runs from z=L (low) to z=0 (high); shift so z=0 is the high end and +L the low end
  B.add('wood', g, '#a8744a', [0, 0, 0], [0, 0, 0], [1, 1, 1], [0.6, 0.6]);
  const ang = Math.atan2(h, L), len = Math.hypot(L, h);
  for (const sx of [-1, 1]) B.add('snowV', G.rbox(0.25, 0.14, len, 0.06), SNOW, [sx * 0.82, h / 2 + 0.08, L / 2], [ang, 0, 0]);
  for (let i = 1; i < 6; i++) B.add('wood', G.box(1.82, 0.05, 0.12), '#6b4226', [0, h * (1 - i / 6) + 0.03, L * i / 6], [ang, 0, 0]);
  return B.build();
}
function artCoin() {
  const B = new Builder();
  const cap = new THREE.CircleGeometry(0.38, 24);
  B.add('coin', cap, '#fff', [0, 0, 0.045]); B.add('coin', cap, '#fff', [0, 0, -0.045], [0, Math.PI, 0]);
  B.add('coinEdge', G.cyl(0.38, 0.38, 0.09, 24, true), '#fff', [0, 0, 0], [Math.PI / 2, 0, 0]);
  return B.build();
}

// ---------- power-up pickups (few, individual meshes) ----------
function iconTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.translate(64, 64);
  if (kind === 'x2') { g.fillStyle = '#ffcf3d'; g.beginPath(); for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, r = k % 2 ? 50 : 60; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); g.font = '900 54px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#8a3a0a'; g.strokeText('2X', 0, 4); g.fillStyle = '#fff'; g.fillText('2X', 0, 4); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function buildPowerMesh(kind) {
  const B = new Builder();
  if (kind === 'magnet') {
    B.add('gloss', G.tor(0.32, 0.12, 10, 20, Math.PI), '#e8322e', [0, 0.05, 0], [0, 0, Math.PI]);
    for (const s of [-1, 1]) { B.add('gloss', G.cyl(0.12, 0.12, 0.3, 12), '#e8322e', [s * 0.32, 0.18, 0]); B.add('metal', G.cyl(0.125, 0.125, 0.16, 12), '#e9eef5', [s * 0.32, 0.4, 0]); }
  } else if (kind === 'kite') {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.55, 0, -0.38, 0.05, 0, 0, -0.55, 0, 0.38, 0.05, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]); const ng = g.toNonIndexed(); ng.computeVertexNormals();
    const cA = new THREE.Color('#ff4f7b'), cB = new THREE.Color('#ffd23f'); const pg = paint(ng, (x, y) => (x * y > 0) ? [cA.r, cA.g, cA.b] : [cB.r, cB.g, cB.b]); pg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pg.attributes.position.count * 2), 2));
    B.addRaw('gloss', pg);
    B.add('wood', G.box(0.03, 1.1, 0.03), '#6b4226', [0, 0, 0.02]); B.add('wood', G.box(0.76, 0.03, 0.03), '#6b4226', [0, 0.05, 0.02]);
    for (let i = 0; i < 4; i++) B.add('gloss', G.box(0.12, 0.08, 0.02), ['#3a8bff', '#36d07a', '#ff4f7b', '#ffd23f'][i], [Math.sin(i * 1.3) * 0.08, -0.65 - i * 0.16, 0], [0, 0, i * 0.5]);
  } else if (kind === 'x2') {
    B.add('metal', G.cyl(0.42, 0.42, 0.1, 24), '#ffb81a', [0, 0, 0], [Math.PI / 2, 0, 0]);
  } else if (kind === 'shield') {
    B.add('ice', G.cyl(0.45, 0.45, 0.1, 6), '#fff', [0, 0, 0], [Math.PI / 2, 0, Math.PI / 6]);
    B.add('lamp', G.cyl(0.22, 0.22, 0.12, 6), '#9fe6ff', [0, 0, 0], [Math.PI / 2, 0, Math.PI / 6]);
    B.add('metal', G.tor(0.45, 0.04, 6, 6), '#e9f6ff', [0, 0, 0], [0, 0, Math.PI / 6]);
  } else if (kind === 'boots') {
    B.add('gloss', G.rbox(0.28, 0.42, 0.3, 0.1), '#3ab0ff', [0, 0.06, 0]); B.add('gloss', G.rbox(0.3, 0.16, 0.5, 0.07), '#3ab0ff', [0, -0.12, 0.1]);
    B.add('gloss', G.rbox(0.32, 0.06, 0.54, 0.03), '#ffcf3d', [0, -0.22, 0.1]);
    for (const s of [-1, 1]) { const w = new THREE.Shape(); w.moveTo(0, 0); w.quadraticCurveTo(0.25, 0.35, 0.45, 0.3); w.quadraticCurveTo(0.3, 0.15, 0.4, 0.05); w.quadraticCurveTo(0.2, 0.0, 0, 0); const wg = new THREE.ExtrudeGeometry(w, { depth: 0.02, bevelEnabled: false }); B.add('gloss', wg, '#ffffff', [s * 0.14, 0.1, 0], [0, s > 0 ? 0 : Math.PI, 0]); }
  }
  const parts = B.build(); const grp = new THREE.Group();
  for (const k in parts) { const m = new THREE.Mesh(parts[k], M[k]); m.castShadow = true; grp.add(m); }
  if (kind === 'x2') { const face = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), curved(new THREE.MeshStandardMaterial({ map: iconTex('x2'), transparent: true, roughness: 0.4, emissive: '#ffffff', emissiveMap: iconTex('x2'), emissiveIntensity: 0.25 }))); face.position.z = 0.056; grp.add(face); const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -0.056; grp.add(back); }
  // glowing bubble
  const bub = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 16), BUBBLE()); grp.add(bub);
  return grp;
}
let _bub;
function BUBBLE() {
  if (_bub) return _bub;
  _bub = curved(new THREE.MeshStandardMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, envMapIntensity: 2, depthWrite: false, emissive: '#5fb8ff', emissiveIntensity: 0.25 }));
  _bub.userData.key = 'bubble'; return _bub;
}

// ---------- runtime containers ----------
export const KINDS = ['magnet', 'kite', 'x2', 'shield', 'boots'];
export class Obstacles {
  constructor(scene) {
    this.scene = scene;
    this.pf = {
      low: new Prefab(scene, artLow(), 40, { shadow: true }),
      log: new Prefab(scene, artLog(), 30, { shadow: true }),
      high: new Prefab(scene, artHigh(), 40, { shadow: true }),
      snowman: new Prefab(scene, artSnowman(), 30, { shadow: true }),
      ice: new Prefab(scene, artIce(), 30, { shadow: true }),
      cart: new Prefab(scene, artCart(false), 50, { shadow: true, tint: ['plaster'] }),
      loco: new Prefab(scene, artCart(true), 12, { shadow: true, tint: ['plaster'] }),
      ramp: new Prefab(scene, artRamp(), 20, { shadow: true }),
      coin: new Prefab(scene, artCoin(), 260, { shadow: false }),
    };
    this.list = []; this.coins = []; this.powers = [];
    this.powerPool = {}; for (const k of KINDS) this.powerPool[k] = [];
  }
  reset() {
    for (const o of this.list) this.pf[o.art].remove(o.h);
    for (const c of this.coins) if (c.h >= 0) this.pf.coin.remove(c.h);
    for (const p of this.powers) { p.mesh.visible = false; this.powerPool[p.kind].push(p.mesh); }
    this.list = []; this.coins = []; this.powers = [];
  }
  add(type, lane, z, extra = {}) {
    const D = {
      low:     { art: 'low', h: 1.0, len: 0.35, w: 1.9, pass: 'jump' },
      log:     { art: 'log', h: 0.9, len: 0.95, w: 1.95, pass: 'jump' },
      high:    { art: 'high', h: 3.1, len: 0.3, w: 1.9, pass: 'duck', under: 1.28 },
      snowman: { art: 'snowman', h: 3.0, len: 1.3, w: 1.5, pass: 'none' },
      ice:     { art: 'ice', h: 1.9, len: 0.95, w: 1.8, pass: 'none' },
      cart:    { art: 'cart', h: CART_TOP, len: CART_L, w: 1.86, pass: 'top', top: CART_TOP },
      loco:    { art: 'loco', h: CART_TOP, len: CART_L, w: 1.9, pass: 'top', top: CART_TOP },
      ramp:    { art: 'ramp', h: CART_TOP, len: 4.6, w: 1.82, pass: 'ramp' },
    }[type];
    const o = { type, lane, x: LANES[lane], z, ...D, vz: 0, ...extra };
    // z is the FRONT edge (nearest the player); the obstacle extends to z - len
    const cz = (o.art === 'cart' || o.art === 'loco') ? z - o.len / 2 : (o.art === 'ramp' ? z - o.len : z - o.len / 2);
    o.h = o.h; o.handle = this.pf[o.art].add(o.x, 0, cz, o.art === 'ramp' ? 0 : 0, 1, extra.tint || null);
    o.h_ = o.handle; o.h = D.h; o.hId = o.handle;
    this.list.push(o); return o;
  }
  remove(o) { this.pf[o.art].remove(o.hId); }
  coin(x, y, z) { const h = this.pf.coin.add(x, y, z); this.coins.push({ x, y, z, h, taken: false, t: 0 }); }
  coinLine(lane, z0, n, y = 0.95) { for (let i = 0; i < n; i++) this.coin(LANES[lane], y, z0 - i * COIN_SPACING); }
  coinArc(lane, zc, n, base = 0.95, peak = 2.6) { for (let i = 0; i < n; i++) { const t = i / (n - 1), z = zc + (0.5 - t) * (n - 1) * COIN_SPACING * 0.95; this.coin(LANES[lane], base + Math.sin(t * Math.PI) * (peak - base), z); } }
  power(kind, lane, z, y = 1.2) {
    let mesh = this.powerPool[kind].pop(); if (!mesh) { mesh = buildPowerMesh(kind); this.scene.add(mesh); }
    mesh.visible = true; mesh.position.set(LANES[lane], y, z); this.powers.push({ kind, x: LANES[lane], y, z, mesh, taken: false });
  }
  /** remove everything behind the player */
  cull(pz) {
    for (let i = this.list.length - 1; i >= 0; i--) { const o = this.list[i]; if (o.z - o.len > pz + 12) { this.remove(o); this.list.splice(i, 1); } }
    for (let i = this.coins.length - 1; i >= 0; i--) { const c = this.coins[i]; if (c.z > pz + 10 || (c.taken && c.t > 0.5)) { if (c.h >= 0) this.pf.coin.remove(c.h); this.coins.splice(i, 1); } }
    for (let i = this.powers.length - 1; i >= 0; i--) { const p = this.powers[i]; if (p.z > pz + 10 || p.taken) { p.mesh.visible = false; this.powerPool[p.kind].push(p.mesh); this.powers.splice(i, 1); } }
  }
  clearAhead(pz, dist) {
    for (let i = this.list.length - 1; i >= 0; i--) { const o = this.list[i]; if (o.z - o.len < pz + 2 && o.z > pz - dist) { this.remove(o); this.list.splice(i, 1); } }
  }
  shift(dz) {
    for (const o of this.list) { o.z += dz; if (o.z0 !== undefined) o.z0 += dz; if (o.zm !== undefined) o.zm += dz; }
    for (const c of this.coins) c.z += dz; for (const p of this.powers) { p.z += dz; p.mesh.position.z += dz; }
    this.pf.low.shift(dz); this.pf.log.shift(dz); this.pf.high.shift(dz); this.pf.snowman.shift(dz); this.pf.ice.shift(dz); this.pf.cart.shift(dz); this.pf.loco.shift(dz); this.pf.ramp.shift(dz); this.pf.coin.shift(dz);
  }
  /** animate coins (spin, magnet pull, pickup pop) and moving sledges */
  update(dt, t, P, magnet) {
    const cp = this.pf.coin;
    for (const c of this.coins) {
      if (c.taken) { c.t += dt; if (c.h >= 0) { const s = Math.max(0.01, 1 - c.t * 3); cp.set(c.h, c.x, c.y + c.t * 3, c.z, t * 12, s); if (c.t > 0.33) { cp.remove(c.h); c.h = -1; } } continue; }
      if (magnet && Math.abs(c.z - P.z) < 16 && c.z < P.z + 1) {
        const dx = P.x - c.x, dy = (P.y + 0.8) - c.y, dz = P.z - c.z, d = Math.hypot(dx, dy, dz);
        if (d < 9) { const k = Math.min(1, dt * (8 + 30 / (d + 0.5))); c.x += dx * k; c.y += dy * k; c.z += dz * k; }
      }
      if (c.z > P.z - 70) cp.set(c.h, c.x, c.y + Math.sin(t * 3 + c.z * 0.3) * 0.05, c.z, t * 3.2 + c.z * 0.15);
    }
    for (const p of this.powers) { p.mesh.rotation.y = t * 2.2; p.mesh.position.y = p.y + Math.sin(t * 3 + p.z) * 0.12; }
    for (const o of this.list) {
      if (o.moving) {
        if (!o.active && P.z - o.zm < o.actDist) o.active = true;
        if (o.active) { o.z += o.vz * dt; this.pf[o.art].set(o.hId, o.x, 0, o.z - o.len / 2); }
      }
    }
  }
}
export { CART_L, CART_TOP };
