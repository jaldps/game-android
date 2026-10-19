// Procedural low-poly geometry. Every geometry carries: position, normal, color, paint (0 vertex colour / 1 instance tint / 2 tint2), limb.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

class GB {
  constructor() { this.parts = []; }
  add(geo, o = {}) {
    let g = geo;
    if (g.index && o.flat !== false) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const s = o.s ?? [1, 1, 1];
    _e.set(...(o.r ?? [0, 0, 0])); _q.setFromEuler(_e);
    _m.compose(_v.set(...(o.p ?? [0, 0, 0])), _q, _s.set(...s));
    g.applyMatrix4(_m);
    if (o.jitter) {
      const p = g.attributes.position; const map = new Map();
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        let d = map.get(key); if (!d) { d = [(Math.random() - .5) * o.jitter, (Math.random() - .5) * o.jitter, (Math.random() - .5) * o.jitter]; map.set(key, d); }
        p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
      }
    }
    if (o.flat !== false) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), paint = new Float32Array(n), limb = new Float32Array(n);
    _c.set(o.c ?? '#ffffff');
    const pos = g.attributes.position;
    let y0 = Infinity, y1 = -Infinity;
    if (o.grad) for (let i = 0; i < n; i++) { y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)); }
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (o.grad) { const t = (pos.getY(i) - y0) / Math.max(1e-4, y1 - y0); k = o.grad[0] + (o.grad[1] - o.grad[0]) * t; }
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
      paint[i] = o.paint ?? 0; limb[i] = o.limb ?? 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('paint', new THREE.BufferAttribute(paint, 1));
    g.setAttribute('limb', new THREE.BufferAttribute(limb, 1));
    if (g.index) g = g.toNonIndexed();
    this.parts.push(g);
    return this;
  }
  box(w, h, d, o = {}) { const p = o.p ?? [0, 0, 0]; return this.add(new THREE.BoxGeometry(w, h, d), { ...o, p: o.base === false ? p : [p[0], p[1] + h / 2, p[2]] }); }
  rbox(w, h, d, rad, o = {}) { const p = o.p ?? [0, 0, 0]; return this.add(new RoundedBoxGeometry(w, h, d, 1, rad), { flat: false, ...o, p: [p[0], p[1] + h / 2, p[2]] }); }
  cyl(rt, rb, h, seg, o = {}) { const p = o.p ?? [0, 0, 0]; return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), { ...o, p: o.base === false ? p : [p[0], p[1] + h / 2, p[2]] }); }
  sphere(r, ws, hs, o = {}) { return this.add(new THREE.SphereGeometry(r, ws, hs), { flat: false, ...o }); }
  hemi(r, ws, hs, o = {}) { return this.add(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2), { flat: false, ...o }); }
  ico(r, det, o = {}) { return this.add(new THREE.IcosahedronGeometry(r, det), o); }
  cone(r, h, seg, o = {}) { const p = o.p ?? [0, 0, 0]; return this.add(new THREE.ConeGeometry(r, h, seg), { ...o, p: o.base === false ? p : [p[0], p[1] + h / 2, p[2]] }); }
  build() { const g = mergeGeometries(this.parts, false); g.computeBoundingSphere(); return g; }
}

const SKIN = '#f1c4a0', HAIR = '#4a3020', DARK = '#2a2d34', METAL = '#3c424d', GLASS = '#26364c', WOOD = '#9a6a43';

export function person(variant = 0) {
  const b = new GB();
  const hair = ['#3b2616', '#1d1a19', '#8a5a2b', '#d9b26a', '#a33b20'][variant % 5];
  const skin = ['#f1c4a0', '#d9a07a', '#a8714f', '#7a4d32', '#f4d2b5'][variant % 5];
  // legs (limb 1/2) — pivot at hip y=0.82
  b.box(0.17, 0.74, 0.2, { p: [-0.1, 0.08, 0], paint: 2, limb: 1 });
  b.box(0.17, 0.74, 0.2, { p: [0.1, 0.08, 0], paint: 2, limb: 2 });
  b.box(0.18, 0.1, 0.28, { p: [-0.1, 0, 0.04], c: '#33302e', limb: 1 });
  b.box(0.18, 0.1, 0.28, { p: [0.1, 0, 0.04], c: '#33302e', limb: 2 });
  // hips + torso
  b.box(0.4, 0.14, 0.22, { p: [0, 0.76, 0], paint: 2 });
  b.add(new THREE.CylinderGeometry(0.25, 0.21, 0.56, 7), { p: [0, 1.15, 0], s: [1, 1, 0.62], paint: 1 });
  // arms (limb 3/4) — pivot at shoulder y=1.36
  b.box(0.12, 0.28, 0.14, { p: [-0.31, 1.1, 0], paint: 1, limb: 3 });
  b.box(0.12, 0.28, 0.14, { p: [0.31, 1.1, 0], paint: 1, limb: 4 });
  b.box(0.1, 0.32, 0.12, { p: [-0.31, 0.8, 0], c: skin, limb: 3 });
  b.box(0.1, 0.32, 0.12, { p: [0.31, 0.8, 0], c: skin, limb: 4 });
  // neck + head + hair
  b.cyl(0.06, 0.06, 0.1, 6, { p: [0, 1.42, 0], c: skin });
  b.sphere(0.165, 7, 5, { p: [0, 1.62, 0], c: skin });
  b.add(new THREE.SphereGeometry(0.178, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.55), { flat: false, p: [0, 1.64, -0.012], r: [-0.25, 0, 0], c: hair });
  return b.build();
}

export function car(kind = 'car') {
  const b = new GB();
  if (kind === 'bus') {
    b.rbox(2.5, 2.5, 10.2, 0.25, { p: [0, 0.45, 0], paint: 1, grad: [0.86, 1.04] });
    b.box(2.56, 0.95, 8.2, { p: [0, 1.65, -0.5], c: GLASS });
    b.box(2.2, 1.1, 0.08, { p: [0, 1.55, 5.1], c: GLASS });
    b.box(2.3, 0.12, 9.6, { p: [0, 2.95, 0], c: '#f3f3f3' });
    b.box(2.0, 0.3, 0.06, { p: [0, 2.6, 5.12], c: '#ffb52e' });
    b.box(2.58, 0.18, 10.0, { p: [0, 0.45, 0], c: '#2d2f36' });
    for (const z of [-3.4, 3.2]) for (const x of [-1.1, 1.1]) b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.36, 8), { p: [x, 0.5, z], r: [0, 0, Math.PI / 2], c: '#1e1f24' });
    b.box(0.5, 0.18, 0.06, { p: [-0.85, 0.75, 5.12], c: '#fff6cf' }); b.box(0.5, 0.18, 0.06, { p: [0.85, 0.75, 5.12], c: '#fff6cf' });
    b.box(0.4, 0.22, 0.06, { p: [-0.95, 0.85, -5.12], c: '#e0282a' }); b.box(0.4, 0.22, 0.06, { p: [0.95, 0.85, -5.12], c: '#e0282a' });
    return b.build();
  }
  if (kind === 'truck') {
    b.rbox(2.2, 1.9, 2.2, 0.18, { p: [0, 0.5, 2.7], paint: 1, grad: [0.85, 1.05] });
    b.box(2.0, 0.7, 0.08, { p: [0, 1.6, 3.82], c: GLASS });
    b.box(2.24, 0.6, 1.2, { p: [0, 1.5, 2.5], c: GLASS });
    b.rbox(2.4, 2.6, 5.2, 0.1, { p: [0, 0.6, -1.1], c: '#f4f1ea', grad: [0.85, 1.0] });
    b.box(2.42, 0.4, 3.0, { p: [0, 1.7, -1.1], paint: 1 });
    b.box(2.0, 0.3, 7.6, { p: [0, 0.35, 0.3], c: '#2b2c31' });
    for (const z of [-2.6, -1.3, 2.7]) for (const x of [-1.0, 1.0]) b.add(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 8), { p: [x, 0.46, z], r: [0, 0, Math.PI / 2], c: '#1e1f24' });
    return b.build();
  }
  // sedan / taxi / police / van
  const L = kind === 'van' ? 4.6 : 4.2;
  b.rbox(1.9, 0.62, L, 0.22, { p: [0, 0.26, 0], paint: 1, grad: [0.8, 1.05] });
  if (kind === 'van') {
    b.rbox(1.84, 1.05, 3.4, 0.2, { p: [0, 0.8, -0.5], paint: 1 });
    b.box(1.86, 0.45, 2.9, { p: [0, 1.25, -0.4], c: GLASS });
    b.box(1.6, 0.5, 0.06, { p: [0, 1.22, 1.22], r: [-0.35, 0, 0], c: GLASS });
  } else {
    // cabin: glass block + roof
    b.add(new THREE.CylinderGeometry(0.78, 1.0, 0.56, 4, 1), { p: [0, 1.15, -0.25], r: [0, Math.PI / 4, 0], s: [1.13, 1, 1.62], c: GLASS });
    b.rbox(1.42, 0.1, 1.55, 0.04, { p: [0, 1.4, -0.25], paint: 1 });
  }
  b.box(1.95, 0.2, 0.14, { p: [0, 0.3, L / 2], c: '#2e3036' });
  b.box(1.95, 0.2, 0.14, { p: [0, 0.3, -L / 2], c: '#2e3036' });
  b.box(0.42, 0.14, 0.06, { p: [-0.62, 0.66, L / 2 + 0.01], c: '#fff8d6' }); b.box(0.42, 0.14, 0.06, { p: [0.62, 0.66, L / 2 + 0.01], c: '#fff8d6' });
  b.box(0.4, 0.13, 0.06, { p: [-0.65, 0.68, -L / 2 - 0.01], c: '#e3262b' }); b.box(0.4, 0.13, 0.06, { p: [0.65, 0.68, -L / 2 - 0.01], c: '#e3262b' });
  for (const z of [-1.3, 1.3]) for (const x of [-0.86, 0.86]) {
    b.add(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 8), { p: [x, 0.34, z], r: [0, 0, Math.PI / 2], c: '#1c1d22' });
    b.add(new THREE.CylinderGeometry(0.18, 0.18, 0.28, 6), { p: [x, 0.34, z], r: [0, 0, Math.PI / 2], c: '#b9bec6' });
  }
  if (kind === 'taxi') { b.box(0.7, 0.22, 0.3, { p: [0, 1.45, -0.25], c: '#fff4c2' }); }
  if (kind === 'police') { b.box(0.9, 0.16, 0.3, { p: [0, 1.45, -0.25], c: '#2b6bff' }); b.box(0.45, 0.16, 0.3, { p: [0.22, 1.451, -0.25], c: '#ff2b2b' }); }
  return b.build();
}

export function tree(kind = 'round') {
  const b = new GB();
  if (kind === 'conifer') {
    b.cyl(0.12, 0.2, 1.2, 6, { c: '#6b4630' });
    b.cone(1.4, 2.0, 7, { p: [0, 1.0, 0], paint: 1, grad: [0.7, 0.95], jitter: 0.12 });
    b.cone(1.1, 1.8, 7, { p: [0, 2.0, 0], paint: 1, grad: [0.78, 1.0], jitter: 0.1 });
    b.cone(0.75, 1.5, 7, { p: [0, 3.0, 0], paint: 1, grad: [0.85, 1.08], jitter: 0.08 });
    return b.build();
  }
  if (kind === 'palm') {
    let x = 0, y = 0;
    for (let i = 0; i < 5; i++) { const nx = x + 0.08 * i; b.cyl(0.13 - i * 0.012, 0.16 - i * 0.012, 0.9, 6, { p: [nx, y, 0], r: [0, 0, -0.06 * i], c: i % 2 ? '#8a6a48' : '#9c7a54' }); x = nx; y += 0.88; }
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + (i % 2) * 0.2;
      const droop = 0.35 + (i % 3) * 0.12;
      // each frond: 3 flattened segments drooping outward
      for (let k = 0; k < 2; k++) {
        const d0 = 0.45 + k * 0.85, y0 = y + 0.15 - k * k * droop * 0.35;
        b.add(new THREE.SphereGeometry(0.5, 5, 2), { p: [x + Math.cos(a) * d0, y0, Math.sin(a) * d0], r: [0, -a, -0.25 - k * 0.5], s: [1.0, 0.06, 0.28 - k * 0.06], paint: 1, c: k === 1 ? '#c8e6a8' : '#e2f2cc' });
      }
    }
    b.sphere(0.25, 6, 5, { p: [x, y, 0], c: '#6b4a2c' });
    return b.build();
  }
  if (kind === 'bush') {
    b.ico(0.6, 1, { p: [0, 0.45, 0], s: [1, 0.8, 1], paint: 1, grad: [0.7, 1.05], jitter: 0.12 });
    b.ico(0.45, 1, { p: [0.4, 0.38, 0.15], s: [1, 0.85, 1], paint: 1, grad: [0.72, 1.05], jitter: 0.1 });
    b.ico(0.4, 0, { p: [-0.35, 0.35, -0.1], paint: 1, grad: [0.72, 1.0], jitter: 0.08 });
    return b.build();
  }
  b.cyl(0.13, 0.2, 2.0, 6, { c: '#7a5236' });
  b.cyl(0.05, 0.07, 0.8, 5, { p: [0.25, 1.4, 0], r: [0, 0, -0.6], c: '#7a5236' });
  b.ico(1.25, 1, { p: [0, 2.85, 0], s: [1, 0.86, 1], paint: 1, grad: [0.72, 1.08], jitter: 0.22 });
  b.ico(0.85, 0, { p: [0.75, 2.35, 0.35], s: [1, 0.85, 1], paint: 1, grad: [0.7, 1.0], jitter: 0.15 });
  b.ico(0.8, 0, { p: [-0.7, 2.45, -0.3], s: [1, 0.85, 1], paint: 1, grad: [0.72, 1.02], jitter: 0.15 });
  b.ico(0.7, 0, { p: [0.1, 3.55, -0.2], paint: 1, grad: [0.85, 1.12], jitter: 0.12 });
  return b.build();
}

export function prop(kind) {
  const b = new GB();
  switch (kind) {
    case 'hydrant':
      b.cyl(0.2, 0.22, 0.08, 8, { c: '#b51f1f' });
      b.cyl(0.14, 0.15, 0.55, 8, { p: [0, 0.08, 0], c: '#e0332b', flat: false });
      b.hemi(0.15, 8, 4, { p: [0, 0.62, 0], c: '#e0332b' });
      b.cyl(0.05, 0.05, 0.1, 6, { p: [0, 0.74, 0], c: '#c9c9c9' });
      b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 6), { p: [0, 0.45, 0], r: [0, 0, Math.PI / 2], c: '#c9c9c9' });
      break;
    case 'bin':
      b.cyl(0.28, 0.24, 0.85, 10, { paint: 1, grad: [0.75, 1.0], flat: false });
      b.cyl(0.31, 0.31, 0.1, 10, { p: [0, 0.85, 0], c: '#3a3d44' });
      b.cyl(0.29, 0.29, 0.06, 10, { p: [0, 0.38, 0], c: '#d8d8d8' });
      break;
    case 'bench':
      for (const z of [-0.15, 0, 0.15]) b.box(1.8, 0.06, 0.12, { p: [0, 0.45, z], c: WOOD });
      for (const y of [0.62, 0.78]) b.box(1.8, 0.12, 0.05, { p: [0, y, -0.26], r: [-0.12, 0, 0], c: WOOD });
      for (const x of [-0.75, 0.75]) { b.box(0.08, 0.45, 0.45, { p: [x, 0, 0], c: METAL }); b.box(0.06, 0.5, 0.06, { p: [x, 0.45, -0.24], c: METAL }); }
      break;
    case 'lamp': {
      const LP = '#5b6573';
      b.cyl(0.15, 0.19, 0.35, 6, { c: LP });
      b.cyl(0.055, 0.075, 4.0, 6, { c: LP });
      b.add(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 5), { p: [0, 4.15, 0.25], r: [1.0, 0, 0], c: LP });
      b.box(0.08, 0.08, 0.5, { p: [0, 4.33, 0.75], c: LP });
      b.box(0.36, 0.14, 0.62, { p: [0, 4.2, 1.1], c: '#3c4450' });
      b.box(0.3, 0.03, 0.52, { p: [0, 4.185, 1.1], c: '#fff1bf' });
      break; }
    case 'mailbox':
      b.box(0.5, 0.75, 0.42, { p: [0, 0.25, 0], c: '#2a63d4' });
      b.add(new THREE.CylinderGeometry(0.21, 0.21, 0.5, 10, 1, false, 0, Math.PI), { p: [0, 1.0, 0], r: [0, 0, Math.PI / 2], c: '#2a63d4' });
      for (const x of [-0.2, 0.2]) for (const z of [-0.16, 0.16]) b.box(0.06, 0.25, 0.06, { p: [x, 0, z], c: '#1c2d55' });
      break;
    case 'cone':
      b.box(0.5, 0.05, 0.5, { c: '#e85d1a' });
      b.cone(0.2, 0.7, 10, { p: [0, 0.05, 0], c: '#ff6a1f', flat: false });
      b.cyl(0.13, 0.155, 0.12, 10, { p: [0, 0.3, 0], c: '#ffffff' });
      break;
    case 'booth':
      b.box(1.0, 2.3, 1.0, { c: '#d8262c' });
      b.box(1.02, 1.5, 0.8, { p: [0, 0.6, 0], c: '#a8d4ef' });
      b.box(0.8, 1.5, 1.02, { p: [0, 0.6, 0], c: '#a8d4ef' });
      b.box(1.1, 0.12, 1.1, { p: [0, 2.3, 0], c: '#b81e24' });
      break;
    case 'busstop':
      b.box(3.2, 0.08, 1.4, { p: [0, 2.3, 0], c: '#e9edf2' });
      for (const x of [-1.5, 1.5]) b.box(0.08, 2.3, 0.08, { p: [x, 0, -0.6], c: METAL });
      b.box(3.0, 1.7, 0.05, { p: [0, 0.4, -0.62], c: '#bfe2f5' });
      b.box(0.06, 1.8, 1.1, { p: [1.5, 0.35, 0], c: '#ff7a3d' });
      b.box(2.2, 0.08, 0.4, { p: [0, 0.48, -0.35], c: WOOD });
      break;
    case 'table': // cafe table with umbrella
      b.cyl(0.4, 0.4, 0.05, 10, { p: [0, 0.75, 0], c: '#f4f4f4' });
      b.cyl(0.04, 0.04, 2.3, 5, { c: METAL });
      b.add(new THREE.ConeGeometry(1.35, 0.55, 8, 1, true), { p: [0, 2.3, 0], paint: 1, c: '#ffffff' });
      b.add(new THREE.ConeGeometry(1.35, 0.55, 8, 1, true), { p: [0, 2.3, 0], r: [Math.PI, 0, 0], c: '#d8d8d8' });
      for (const a of [0, 2.1, 4.2]) { b.box(0.38, 0.06, 0.38, { p: [Math.cos(a) * 0.75, 0.45, Math.sin(a) * 0.75], c: '#c74f3a' }); b.box(0.06, 0.45, 0.06, { p: [Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75], c: METAL }); }
      break;
    case 'kiosk': {
      // painted market stall: panelled body, glazed counter, produce crates, chalkboard, striped canopy
      b.rbox(3.0, 2.2, 2.6, 0.08, { paint: 1, grad: [0.74, 1.0] });
      b.box(3.06, 0.22, 2.66, { p: [0, 0, 0], c: '#8a7a68' });                 // plinth
      b.box(3.06, 0.1, 2.66, { p: [0, 2.2, 0], c: '#fffaf0' });                // cornice
      for (const x of [-1.05, 0, 1.05]) b.box(0.1, 1.5, 2.64, { p: [x, 0.5, 0], c: '#ffffff' }); // pilasters
      b.box(2.6, 1.15, 0.06, { p: [0, 0.95, 1.31], c: '#243040' });            // glazed front
      b.box(2.64, 0.07, 0.07, { p: [0, 1.52, 1.33], c: '#fffaf0' });
      b.box(0.07, 1.15, 0.07, { p: [0, 0.95, 1.33], c: '#fffaf0' });
      b.box(2.9, 0.16, 0.56, { p: [0, 1.58, 1.46], c: '#efe6d4' });            // counter shelf
      // produce crates on the counter
      for (let i = 0; i < 3; i++) {
        const cx = -0.86 + i * 0.86;
        b.box(0.62, 0.22, 0.44, { p: [cx, 1.74, 1.5], c: ['#c08a52', '#b07c46', '#cb9560'][i] });
        for (let k = 0; k < 4; k++) b.ico(0.1, 0, { p: [cx - 0.18 + (k % 2) * 0.34, 1.99, 1.42 + (k < 2 ? -0.1 : 0.1)], c: ['#ff5d4a', '#ffd23f', '#6fc44a', '#ff8c42'][(i + k) % 4] });
      }
      // chalkboard menu + side hatch
      b.box(0.06, 0.8, 0.62, { p: [1.52, 0.85, -0.2], c: '#2b3b34' });
      b.box(0.02, 0.1, 0.44, { p: [1.56, 1.42, -0.2], c: '#e8e2d2' });
      b.box(0.02, 0.07, 0.3, { p: [1.56, 1.24, -0.2], c: '#d7cfbc' });
      // striped canopy with scalloped valance
      for (let i = 0; i < 8; i++) {
        b.box(3.24 / 8, 0.08, 1.45, { p: [-1.62 + 3.24 / 16 + i * 3.24 / 8, 2.42, 1.74], r: [0.33, 0, 0], c: i % 2 ? '#fdf6ec' : '#e8473a' });
        b.box(3.24 / 8 - 0.03, 0.26, 0.06, { p: [-1.62 + 3.24 / 16 + i * 3.24 / 8, 2.08, 2.42], c: i % 2 ? '#fdf6ec' : '#e8473a' });
      }
      b.box(3.3, 0.28, 2.84, { p: [0, 2.3, 0], c: '#f7f2e6' });
      b.box(1.7, 0.56, 0.14, { p: [0, 2.58, 0.9], c: '#ffd24a' });             // sign board
      b.box(1.34, 0.16, 0.05, { p: [0, 2.78, 0.98], c: '#b8771c' });
      b.cyl(0.05, 0.05, 0.5, 6, { p: [0, 2.58, -1.3], c: '#9aa3ad' });
      b.sphere(0.16, 7, 5, { p: [0, 3.2, -1.3], c: '#ff8c42' });
      break; }
    case 'rubble': {                                                            // broken masonry heap left by a swallowed building
      b.ico(1.0, 0, { p: [0, 0.32, 0], s: [1.5, 0.52, 1.4], c: '#a89b8a', jitter: 0.3 });
      const rc = ['#b5a897', '#9c8f7f', '#c2b4a0', '#8e8275'];
      for (let i = 0; i < 9; i++) {
        const a = i * 2.2, rr = 0.35 + (i % 3) * 0.42;
        b.box(0.3 + (i % 3) * 0.14, 0.2 + (i % 2) * 0.16, 0.26 + (i % 4) * 0.1, { p: [Math.cos(a) * rr, 0.08 + (i % 3) * 0.22, Math.sin(a) * rr], r: [(i % 5) * 0.2, a, (i % 3) * 0.26], c: rc[i % 4] });
      }
      for (let i = 0; i < 3; i++) b.cyl(0.035, 0.035, 0.9, 4, { p: [-0.3 + i * 0.35, 0.3, 0.1], r: [0.5 + i * 0.4, i, 0.3], c: '#8a5a3c' }); // bent rebar
      break; }
    case 'dirtpile':
      b.cone(1.25, 0.9, 9, { c: '#7d5e3e', grad: [0.72, 1.05], jitter: 0.12 });
      b.ico(0.4, 0, { p: [0.9, 0.2, 0.4], s: [1.3, 0.6, 1.1], c: '#8a6a46', jitter: 0.12 });
      b.box(0.1, 0.9, 0.1, { p: [-0.8, 0, 0.5], r: [0, 0, 0.3], c: '#8a5a3c' });
      b.box(0.3, 0.26, 0.06, { p: [-0.93, 0.9, 0.5], r: [0, 0, 0.3], c: '#b9bec6' });
      break;
    case 'cfence':                                                              // orange construction barrier
      for (const x of [-1.5, 1.5]) { b.box(0.7, 0.1, 0.5, { p: [x, 0, 0], c: '#d8d2c6' }); b.box(0.09, 1.05, 0.09, { p: [x, 0.1, 0], c: '#e86a1f' }); }
      for (let i = 0; i < 6; i++) b.box(0.52, 0.9, 0.05, { p: [-1.45 + i * 0.58, 0.14, 0], c: i % 2 ? '#ff7a2a' : '#f4f1ea' });
      b.box(3.2, 0.1, 0.07, { p: [0, 1.05, 0], c: '#e86a1f' });
      break;
    case 'digger': {                                                            // mini excavator parked in the dig
      b.box(2.3, 0.42, 1.5, { p: [0, 0.18, 0], c: '#3b3f46' });
      for (const x of [-0.78, 0.78]) b.box(0.34, 0.74, 2.3, { p: [x, 0, 0], c: '#2a2d33' });
      b.rbox(1.5, 1.2, 1.5, 0.12, { p: [-0.2, 0.6, 0], paint: 1, grad: [0.82, 1.02] });
      b.box(1.1, 0.72, 0.06, { p: [-0.2, 1.1, 0.77], c: '#2b3b4e' });
      b.cyl(0.14, 0.14, 2.1, 6, { p: [0.9, 1.0, 0], r: [0, 0, -0.75], c: '#f2b01e' });
      b.cyl(0.11, 0.11, 1.5, 6, { p: [2.0, 1.25, 0], r: [0, 0, 0.9], c: '#f2b01e' });
      b.add(new THREE.CylinderGeometry(0.42, 0.52, 0.7, 6, 1, true), { p: [2.5, 0.42, 0], r: [0, 0, 1.9], c: '#5b6069' });
      break; }
    case 'sign': {                                                              // site hoarding with a works notice
      for (const x of [-1.0, 1.0]) b.box(0.1, 1.5, 0.1, { p: [x, 0, 0], c: '#9aa3ad' });
      b.box(2.4, 1.4, 0.1, { p: [0, 1.0, 0], c: '#f2c230' });
      b.box(2.0, 0.22, 0.04, { p: [0, 2.0, 0.07], c: '#1d2a44' });
      b.box(1.4, 0.16, 0.04, { p: [-0.25, 1.68, 0.07], c: '#1d2a44' });
      b.box(0.9, 0.16, 0.04, { p: [-0.5, 1.4, 0.07], c: '#1d2a44' });
      break; }
    case 'cart':
      b.box(1.6, 0.9, 0.9, { p: [0, 0.35, 0], paint: 1 });
      b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10), { p: [-0.6, 0.3, 0.48], r: [Math.PI / 2, 0, 0], c: DARK });
      b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10), { p: [0.6, 0.3, 0.48], r: [Math.PI / 2, 0, 0], c: DARK });
      b.cyl(0.03, 0.03, 1.4, 4, { p: [0, 1.25, 0], c: METAL });
      for (let i = 0; i < 8; i++) b.add(new THREE.ConeGeometry(1.1, 0.45, 3, 1, true, i * Math.PI / 4, Math.PI / 4), { p: [0, 2.7, 0], c: i % 2 ? '#ffffff' : '#ffb000' });
      break;
    case 'fountain': {
      const prof = [[2.6, 0], [2.9, 0], [2.95, 0.6], [2.7, 0.65], [2.6, 0.4], [0, 0.4]].map(p => new THREE.Vector2(p[0], p[1]));
      b.add(new THREE.LatheGeometry(prof, 24), { c: '#e8ddd0', grad: [0.8, 1.0] });
      b.cyl(2.62, 2.62, 0.06, 24, { p: [0, 0.48, 0], c: '#58b8e8' });
      b.cyl(0.35, 0.5, 1.4, 10, { p: [0, 0.4, 0], c: '#e8ddd0' });
      b.add(new THREE.LatheGeometry([[0, 0], [1.0, 0.25], [1.1, 0.4], [0, 0.3]].map(p => new THREE.Vector2(p[0], p[1])), 16), { p: [0, 1.75, 0], c: '#efe6da' });
      b.cyl(0.95, 0.95, 0.04, 16, { p: [0, 2.1, 0], c: '#7fd0f5' });
      b.cone(0.18, 1.1, 8, { p: [0, 2.1, 0], c: '#cdeeff' });
      break; }
    case 'planter':
      b.box(1.4, 0.55, 1.4, { c: '#c9b9a3', grad: [0.75, 1.0] });
      b.ico(0.6, 1, { p: [0, 0.8, 0], s: [1.1, 0.7, 1.1], paint: 1, grad: [0.75, 1.05], jitter: 0.12 });
      for (let i = 0; i < 5; i++) b.ico(0.12, 0, { p: [Math.cos(i * 1.3) * 0.45, 1.05, Math.sin(i * 1.3) * 0.45], c: ['#ff5d8f', '#ffd23f', '#ff8c42', '#ffffff', '#c86bff'][i] });
      break;
    case 'signal':
      b.cyl(0.08, 0.1, 3.6, 8, { c: '#6b7480' });
      b.box(0.08, 0.08, 2.2, { p: [0, 3.5, 1.1], c: '#6b7480' });
      b.box(0.42, 1.05, 0.12, { p: [0, 2.8, 2.05], c: '#f2c230' });
      b.box(0.34, 0.95, 0.3, { p: [0, 2.85, 2.15], c: '#2a2e35' });
      b.sphere(0.1, 8, 6, { p: [0, 3.6, 2.31], c: '#ff3b30' });
      b.sphere(0.1, 8, 6, { p: [0, 3.32, 2.31], c: '#5a4a1a' });
      b.sphere(0.1, 8, 6, { p: [0, 3.04, 2.31], c: '#1f5d32' });
      break;
    case 'ac':
      b.box(1.4, 0.8, 1.0, { c: '#cfd3d8', grad: [0.8, 1.0] });
      b.cyl(0.36, 0.36, 0.04, 12, { p: [-0.3, 0.8, 0], c: '#555b63' });
      b.cyl(0.36, 0.36, 0.04, 12, { p: [0.35, 0.8, 0], c: '#555b63' });
      break;
    case 'tank':
      for (const x of [-0.7, 0.7]) for (const z of [-0.7, 0.7]) b.cyl(0.06, 0.06, 1.2, 4, { p: [x, 0, z], c: '#5b3e2a' });
      b.cyl(1.1, 1.1, 1.8, 12, { p: [0, 1.2, 0], c: '#9b6b45', grad: [0.85, 1.05] });
      b.cone(1.2, 0.7, 12, { p: [0, 3.0, 0], c: '#6f4a30' });
      break;
    case 'solar':
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        b.box(1.0, 0.06, 1.5, { p: [-1.1 + i * 1.1, 0.45, -0.85 + j * 1.7], r: [0.45, 0, 0], c: '#2a4f8f' });
        b.box(1.04, 0.05, 0.04, { p: [-1.1 + i * 1.1, 0.79, -1.5 + j * 1.7], r: [0.45, 0, 0], c: '#dfe6ee' });
        b.box(0.05, 0.5, 0.05, { p: [-1.1 + i * 1.1, 0, -0.4 + j * 1.7], c: '#9aa3ad' });
      }
      break;
    case 'hut':
      b.box(2.2, 2.3, 2.0, { c: '#d9d4cc', grad: [0.8, 1.0] });
      b.box(2.4, 0.15, 2.2, { p: [0, 2.3, 0], c: '#8d949c' });
      b.box(0.9, 1.8, 0.05, { p: [0, 0, 1.01], c: '#5f6b78' });
      break;
    case 'garden':
      b.box(3.6, 0.35, 3.6, { c: '#8a6f55' });
      b.box(3.4, 0.08, 3.4, { p: [0, 0.35, 0], c: '#5aa83a' });
      for (let i = 0; i < 6; i++) b.ico(0.45, 0, { p: [-1.2 + (i % 3) * 1.2, 0.65, i < 3 ? -0.9 : 0.9], s: [1, 0.8, 1], c: ['#4f9a35', '#6cbf45', '#3f8a3a'][i % 3] });
      break;
    case 'heli':
      b.cyl(1, 1, 0.08, 24, { c: '#3b4049' });
      b.add(new THREE.TorusGeometry(0.82, 0.05, 4, 32), { p: [0, 0.09, 0], r: [Math.PI / 2, 0, 0], c: '#ffd23a' });
      b.box(0.12, 0.02, 0.8, { p: [-0.25, 0.08, 0], c: '#ffffff' }); b.box(0.12, 0.02, 0.8, { p: [0.25, 0.08, 0], c: '#ffffff' }); b.box(0.5, 0.02, 0.12, { p: [0, 0.08, 0], c: '#ffffff' });
      break;
    case 'antenna':
      b.cyl(0.05, 0.08, 4.5, 5, { c: '#d0d4da' });
      b.box(0.8, 0.05, 0.05, { p: [0, 3.2, 0], c: '#d0d4da' });
      b.sphere(0.12, 6, 4, { p: [0, 4.55, 0], c: '#ff3b30' });
      break;
    case 'chimney':
      b.box(0.6, 1.4, 0.6, { c: '#9a4a3a', grad: [0.8, 1.0] });
      b.box(0.72, 0.12, 0.72, { p: [0, 1.4, 0], c: '#5a3a30' });
      break;
    case 'billboard':
      for (const x of [-1.6, 1.6]) b.box(0.12, 2.0, 0.12, { p: [x, 0, 0], c: METAL });
      b.box(4.6, 2.2, 0.15, { p: [0, 2.0, 0], paint: 1 });
      b.box(4.0, 0.5, 0.17, { p: [0, 3.2, 0], c: '#ffffff' });
      b.box(2.4, 0.4, 0.17, { p: [-0.6, 2.4, 0], c: '#1c1f26' });
      break;
    case 'fence':
      for (let i = 0; i < 5; i++) b.box(0.08, 0.9, 0.08, { p: [-2 + i, 0, 0], c: '#f4f1ea' });
      b.box(4.1, 0.08, 0.05, { p: [0, 0.7, 0], c: '#f4f1ea' }); b.box(4.1, 0.08, 0.05, { p: [0, 0.35, 0], c: '#f4f1ea' });
      break;
    case 'flowerbed':
      b.box(2.4, 0.3, 1.0, { c: '#a0826a' });
      for (let i = 0; i < 9; i++) b.ico(0.2, 0, { p: [-1 + (i % 5) * 0.5, 0.42, i < 5 ? -0.2 : 0.2], c: ['#ff4d6d', '#ffd23f', '#ff8fab', '#ffffff', '#b06bff', '#ff7b25'][i % 6] });
      b.box(2.2, 0.08, 0.8, { p: [0, 0.3, 0], c: '#4b8a2e' });
      break;
    case 'statue':
      b.box(1.6, 1.0, 1.6, { c: '#d8cfc2', grad: [0.75, 1] });
      b.cyl(0.25, 0.32, 1.2, 8, { p: [0, 1.0, 0], c: '#5e9c8a' });
      b.sphere(0.25, 8, 6, { p: [0, 2.45, 0], c: '#5e9c8a' });
      b.box(0.15, 0.8, 0.15, { p: [0.3, 1.9, 0], r: [0, 0, -0.6], c: '#5e9c8a' });
      break;
  }
  return b.build();
}

// Gable roof: unit footprint 1x1, height 1, ridge along z, with overhang built-in
export function gableRoof() {
  const b = new GB();
  const sh = new THREE.Shape(); sh.moveTo(-0.56, 0); sh.lineTo(0.56, 0); sh.lineTo(0, 1); sh.lineTo(-0.56, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1.1, bevelEnabled: false });
  g.translate(0, 0, -0.55);
  b.add(g, { paint: 1 });
  return b.build();
}

// Facade boxes / cylinders (unit footprint, y 0..1) with a `facade` attribute (u, v, axis, kind)
export function facadeBox() {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); g.translate(0, 0.5, 0);
  const p = g.attributes.position, n = g.attributes.normal; const fa = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    let a;
    if (Math.abs(ny) > 0.5) a = [x + 0.5, z + 0.5, 0, 1];
    else if (Math.abs(nx) > 0.5) a = [nx > 0 ? 0.5 - z : z + 0.5, y, 2, 0];
    else a = [nz > 0 ? x + 0.5 : 0.5 - x, y, 0, 0];
    fa.set(a, i * 4);
  }
  g.setAttribute('facade', new THREE.BufferAttribute(fa, 4)); g.deleteAttribute('uv');
  g.computeBoundingSphere();
  return g;
}
export function facadeCyl() {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 28, 1).toNonIndexed(); g.translate(0, 0.5, 0);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; const fa = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const ny = n.getY(i);
    const a = Math.abs(ny) > 0.5 ? [p.getX(i) + 0.5, p.getZ(i) + 0.5, 0, 2] : [uv.getX(i), p.getY(i), 1, 0];
    fa.set(a, i * 4);
  }
  g.setAttribute('facade', new THREE.BufferAttribute(fa, 4)); g.deleteAttribute('uv');
  g.computeBoundingSphere();
  return g;
}

// ---------------- set-pieces (only a near-max hole can swallow these) ----------------
export function mega(kind) {
  const b = new GB();
  if (kind === 'spire') {
    const H = 112, seg = 11;
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg;
      const r0 = 8.6 * (1 - t0 * 0.78), r1 = 8.6 * (1 - t1 * 0.78);
      b.add(new THREE.CylinderGeometry(r1, r0, H / seg, 10, 1), { p: [0, H * (t0 + t1) / 2, 0], c: i % 2 ? '#6fa6e8' : '#8cc0f2', flat: false });
      b.add(new THREE.CylinderGeometry(r1 * 1.07, r1 * 1.07, 0.9, 10, 1), { p: [0, H * t1, 0], c: '#2f4f86' });
    }
    // corner fins
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2;
      b.box(0.8, H * 0.94, 0.8, { p: [Math.cos(a) * 7.4, 0, Math.sin(a) * 7.4], r: [0, -a, 0], c: '#c8dcf4' });
    }
    b.cyl(1.9, 5.2, 9, 10, { p: [0, H, 0], c: '#9fd0ff', flat: false });
    b.cyl(0.35, 0.35, 12, 6, { p: [0, H + 9, 0], c: '#d8e4f0' });
    b.sphere(0.9, 8, 6, { p: [0, H + 21.4, 0], c: '#ff3b30' });
    for (let k = 0; k < 3; k++) b.add(new THREE.TorusGeometry(2.6 + k, 0.22, 4, 18), { p: [0, H + 2 + k * 2.6, 0], r: [Math.PI / 2, 0, 0], c: '#ffd23f' });
    return b.build();
  }
  if (kind === 'stadium') {
    const RO = 15.8, RI = 10.4, H = 15;
    // bowl: outer wall ring of panels, inner raked seating
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2, nx = Math.cos(a), nz = Math.sin(a);
      b.box(3.6, H, 1.5, { p: [nx * RO, 0, nz * RO], r: [0, -a + Math.PI / 2, 0], c: i % 2 ? '#e8e2d4' : '#d6cfc0' });
      b.box(3.4, 1.1, 0.7, { p: [nx * (RO + 0.5), H, nz * (RO + 0.5)], r: [0, -a + Math.PI / 2, 0], c: '#b9b2a2' });
      if (i % 4 === 0) b.box(1.4, H * 0.8, 0.3, { p: [nx * (RO + 0.85), 0, nz * (RO + 0.85)], r: [0, -a + Math.PI / 2, 0], c: '#9aa3ad' });
      // raked seating tiers
      for (let t = 0; t < 4; t++) {
        const rr = RI + t * 1.35, hh = 2.2 + t * 3.1;
        b.box(2.6, 1.0, 1.4, { p: [nx * rr, hh, nz * rr], r: [0, -a + Math.PI / 2, 0], c: ['#3f74c8', '#e0453f', '#3f74c8', '#f0c23a'][t], base: false });
      }
    }
    // pitch + markings
    b.cyl(RI - 0.4, RI - 0.4, 0.5, 30, { p: [0, 0, 0], c: '#4f9c3a' });
    b.add(new THREE.TorusGeometry(2.6, 0.18, 4, 24), { p: [0, 0.54, 0], r: [Math.PI / 2, 0, 0], c: '#f0f4ee' });
    b.box(16.4, 0.06, 0.3, { p: [0, 0.54, 0], c: '#f0f4ee' });
    for (const z of [-7.4, 7.4]) b.box(6.4, 0.06, 0.3, { p: [0, 0.54, z], c: '#f0f4ee' });
    // floodlight masts
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      b.cyl(0.3, 0.42, H + 7, 6, { p: [Math.cos(a) * (RO - 0.6), 0, Math.sin(a) * (RO - 0.6)], c: '#9aa3ad' });
      b.box(4.2, 1.5, 0.6, { p: [Math.cos(a) * (RO - 0.6), H + 7, Math.sin(a) * (RO - 0.6)], r: [0, -a, -0.3], c: '#dfe6ee' });
    }
    return b.build();
  }
  // ferris wheel
  const R = 12.4, HUB = 14.5;
  for (const sx of [-1, 1]) {
    b.box(1.1, HUB * 1.08, 1.1, { p: [sx * 5.0, 0, -3.4], r: [0.24, 0, -sx * 0.3], c: '#d8dde4' });
    b.box(1.1, HUB * 1.08, 1.1, { p: [sx * 5.0, 0, 3.4], r: [-0.24, 0, -sx * 0.3], c: '#d8dde4' });
  }
  b.box(13.5, 0.9, 9.6, { p: [0, 0, 0], c: '#b9bec6' });
  b.add(new THREE.CylinderGeometry(1.1, 1.1, 4.2, 10), { p: [0, HUB, 0], r: [Math.PI / 2, 0, 0], c: '#f2c230' });
  for (const z of [-1.5, 1.5]) {
    b.add(new THREE.TorusGeometry(R, 0.34, 4, 36), { p: [0, HUB, z], c: '#f4f7fb' });
    b.add(new THREE.TorusGeometry(R * 0.55, 0.22, 4, 28), { p: [0, HUB, z], c: '#e4e9f0' });
  }
  const cab = ['#ff5a5f', '#ffd23f', '#3fa7ff', '#43d17a', '#ff8c42', '#b06bff'];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, cx = Math.cos(a) * R, cy = HUB + Math.sin(a) * R;
    b.box(0.12, R - 0.4, 0.12, { p: [cx * 0.5, HUB + (cy - HUB) * 0.5, -1.5], r: [0, 0, -a], c: '#dfe6ee', base: false });
    b.box(0.12, R - 0.4, 0.12, { p: [cx * 0.5, HUB + (cy - HUB) * 0.5, 1.5], r: [0, 0, -a], c: '#dfe6ee', base: false });
    b.rbox(1.9, 1.7, 2.3, 0.3, { p: [cx, cy - 1.75, 0], c: cab[i % 6] });
    b.box(2.0, 0.12, 2.4, { p: [cx, cy - 0.12, 0], c: '#e8edf4', base: false });
  }
  // base platform + queue rail
  b.cyl(7.5, 8.2, 0.7, 14, { p: [0, 0, 0], c: '#e0d6c4' });
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; b.cyl(0.07, 0.07, 1.0, 5, { p: [Math.cos(a) * 7.6, 0.7, Math.sin(a) * 7.6], c: '#9aa3ad' }); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.3; b.sphere(0.2, 7, 5, { p: [Math.cos(a) * 8.0, 2.6, Math.sin(a) * 8.0], c: i % 2 ? '#ffd23f' : '#ff5a5f' }); }
  return b.build();
}
