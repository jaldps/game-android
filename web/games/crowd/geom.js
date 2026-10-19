// Procedural low-poly geometry. Props carry: position, normal, color, tint (instance colour applies), sway (wind).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

export class GB {
  constructor() { this.parts = []; }
  add(geo, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    _e.set(...(o.r ?? [0, 0, 0])); _q.setFromEuler(_e);
    _m.compose(_v.set(...(o.p ?? [0, 0, 0])), _q, _s.set(...(o.s ?? [1, 1, 1])));
    g.applyMatrix4(_m);
    if (o.flat) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), tint = new Float32Array(n), sway = new Float32Array(n), limb = new Float32Array(n);
    _c.set(o.c ?? '#ffffff'); if (o.k) _c.multiplyScalar(o.k);
    const pos = g.attributes.position;
    let y0 = Infinity, y1 = -Infinity;
    if (o.grad) for (let i = 0; i < n; i++) { y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)); }
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (o.grad) { const t = (pos.getY(i) - y0) / Math.max(1e-4, y1 - y0); k = o.grad[0] + (o.grad[1] - o.grad[0]) * t; }
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
      tint[i] = o.tint ? 1 : 0; sway[i] = o.sway ? Math.max(0, pos.getY(i) - (o.swayY ?? 0.5)) : 0; limb[i] = o.limb ?? 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('tint', new THREE.BufferAttribute(tint, 1));
    g.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
    g.setAttribute('limb', new THREE.BufferAttribute(limb, 1));
    this.parts.push(g);
    return this;
  }
  box(w, h, d, o = {}) { const p = o.p ?? [0, 0, 0]; return this.add(new THREE.BoxGeometry(w, h, d), { ...o, p: [p[0], p[1] + h / 2, p[2]] }); }
  rbox(w, h, d, rad, o = {}) { const p = o.p ?? [0, 0, 0]; return this.add(new RoundedBoxGeometry(w, h, d, 2, rad), { ...o, p: [p[0], p[1] + h / 2, p[2]] }); }
  cyl(rt, rb, h, seg, o = {}) { const p = o.p ?? [0, 0, 0]; return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), { ...o, p: [p[0], p[1] + h / 2, p[2]] }); }
  sphere(r, ws, hs, o = {}) { return this.add(new THREE.SphereGeometry(r, ws, hs), o); }
  ico(r, det, o = {}) { return this.add(new THREE.IcosahedronGeometry(r, det), { flat: true, ...o }); }
  cone(r, h, seg, o = {}) { const p = o.p ?? [0, 0, 0]; return this.add(new THREE.ConeGeometry(r, h, seg), { ...o, p: [p[0], p[1] + h / 2, p[2]] }); }
  torus(r, t, rs, ts, o = {}) { return this.add(new THREE.TorusGeometry(r, t, rs, ts), o); }
  capsule(r, len, cs, rs, o = {}) { return this.add(new THREE.CapsuleGeometry(r, len, cs, rs), o); }
  build() { const g = mergeGeometries(this.parts, false); g.computeBoundingSphere(); return g; }
}

const METAL = '#5b6577', DARKM = '#3a4150', WOOD = '#b07a4a', STONE = '#e9e4dc', WHITE = '#f6f6f4';

// ---------- person (height ~1.15) ----------
export function person(lo = false) {
  const b = new GB(); const rs = lo ? 5 : 7;
  // legs pivot at hip y=0.46
  b.cyl(0.07, 0.065, 0.42, lo ? 4 : 5, { p: [-0.085, 0.05, 0], k: 0.72, limb: 1 });
  b.cyl(0.07, 0.065, 0.42, lo ? 4 : 5, { p: [0.085, 0.05, 0], k: 0.72, limb: 2 });
  b.box(0.12, 0.07, 0.19, { p: [-0.085, 0, 0.03], k: 0.45, limb: 1 });
  b.box(0.12, 0.07, 0.19, { p: [0.085, 0, 0.03], k: 0.45, limb: 2 });
  // torso
  b.capsule(0.165, 0.26, 2, rs, { p: [0, 0.68, 0], s: [1, 1, 0.78] });
  // arms pivot at shoulder y=0.86
  b.capsule(0.052, 0.28, 1, lo ? 4 : 5, { p: [-0.215, 0.69, 0], r: [0, 0, 0.12], k: 0.92, limb: 3 });
  b.capsule(0.052, 0.28, 1, lo ? 4 : 5, { p: [0.215, 0.69, 0], r: [0, 0, -0.12], k: 0.92, limb: 4 });
  // head
  b.sphere(0.155, lo ? 7 : 10, lo ? 5 : 7, { p: [0, 1.0, 0], k: 1.1, limb: 5 });
  return b.build();
}

// ---------- hats for leaders ----------
export function hat(id) {
  const b = new GB();
  if (id === 'cap') { b.sphere(0.165, 10, 5, { p: [0, 1.04, 0], s: [1, 0.55, 1], c: '#ff4757' }); b.box(0.2, 0.025, 0.16, { p: [0, 1.06, 0.15], c: '#ff4757' }); }
  else if (id === 'tophat') { b.cyl(0.24, 0.24, 0.03, 14, { p: [0, 1.12, 0], c: '#22252e' }); b.cyl(0.14, 0.15, 0.3, 14, { p: [0, 1.14, 0], c: '#22252e' }); b.cyl(0.152, 0.152, 0.05, 14, { p: [0, 1.17, 0], c: '#e03131' }); }
  else if (id === 'party') { b.cone(0.13, 0.36, 12, { p: [0, 1.1, 0], c: '#ff6bcb' }); b.sphere(0.05, 8, 6, { p: [0, 1.48, 0], c: '#ffe066' }); }
  else if (id === 'viking') { b.sphere(0.17, 12, 6, { p: [0, 1.04, 0], s: [1, 0.7, 1], c: '#adb5bd' }); b.cone(0.045, 0.22, 8, { p: [-0.18, 1.06, 0], r: [0, 0, 0.7], c: '#fff4d6' }); b.cone(0.045, 0.22, 8, { p: [0.18, 1.06, 0], r: [0, 0, -0.7], c: '#fff4d6' }); }
  else if (id === 'halo') { b.torus(0.15, 0.03, 6, 20, { p: [0, 1.32, 0], r: [Math.PI / 2, 0, 0], c: '#ffe14d' }); }
  else { // crown
    b.cyl(0.15, 0.13, 0.12, 12, { p: [0, 1.11, 0], c: '#ffcc19' });
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; b.cone(0.035, 0.1, 5, { p: [Math.cos(a) * 0.13, 1.21, Math.sin(a) * 0.13], c: '#ffcc19' }); }
    b.sphere(0.03, 6, 4, { p: [0, 1.17, 0.14], c: '#ff3b5c' });
  }
  return b.build();
}

// ---------- props ----------
export function prop(type, P) {
  const b = new GB(); const fol = P.foliage, blossom = P.blossom;
  switch (type) {
    case 'lamp':
      b.cyl(0.09, 0.12, 0.3, 8, { c: DARKM }); b.cyl(0.05, 0.06, 4.0, 6, { p: [0, 0.3, 0], c: METAL });
      b.box(0.08, 0.08, 1.0, { p: [0, 4.2, 0.45], c: METAL }); b.rbox(0.36, 0.14, 0.6, 0.05, { p: [0, 4.1, 0.95], c: '#e9edf2' }); b.box(0.26, 0.04, 0.46, { p: [0, 4.07, 0.95], c: '#fff6cc' });
      break;
    case 'streettree': {
      b.cyl(0.42, 0.42, 0.25, 10, { c: '#8c95a6' }); b.cyl(0.36, 0.36, 0.05, 10, { p: [0, 0.22, 0], c: '#6b4a2f' });
      b.cyl(0.07, 0.1, 1.6, 6, { c: '#7a5232' });
      const c0 = blossom ? '#ffa8cc' : fol[0];
      b.ico(0.95, 1, { p: [0, 2.2, 0], c: c0, sway: 1, swayY: 1.4, grad: [0.78, 1.12] });
      b.ico(0.7, 1, { p: [0.35, 2.75, 0.2], c: blossom ? '#ffc0da' : fol[1], sway: 1, swayY: 1.4, grad: [0.85, 1.15] });
      break;
    }
    case 'tree': {
      b.cyl(0.12, 0.17, 1.8, 7, { c: '#7a5232' });
      const cs = blossom ? ['#ff9ec4', '#ffb8d4', '#f58bb8'] : fol;
      b.ico(1.35, 1, { p: [0, 2.6, 0], c: cs[0], sway: 1, swayY: 1.5, grad: [0.75, 1.12] });
      b.ico(1.0, 1, { p: [0.7, 3.2, 0.3], c: cs[1], sway: 1, swayY: 1.5, grad: [0.8, 1.15] });
      b.ico(0.95, 1, { p: [-0.6, 3.1, -0.4], c: cs[2] ?? cs[0], sway: 1, swayY: 1.5, grad: [0.8, 1.15] });
      b.ico(0.8, 1, { p: [0.1, 3.75, -0.1], c: cs[1], sway: 1, swayY: 1.5, grad: [0.9, 1.2] });
      break;
    }
    case 'pine':
      b.cyl(0.12, 0.16, 1.0, 6, { c: '#6b4a2f' });
      b.cone(1.25, 1.9, 8, { p: [0, 0.8, 0], c: '#3f9a4a', sway: 1, swayY: 1, grad: [0.75, 1.0] });
      b.cone(0.95, 1.6, 8, { p: [0, 1.9, 0], c: '#4fae55', sway: 1, swayY: 1, grad: [0.8, 1.05] });
      b.cone(0.62, 1.3, 8, { p: [0, 2.9, 0], c: '#5fbe5f', sway: 1, swayY: 1, grad: [0.85, 1.1] });
      break;
    case 'bush':
      b.ico(0.7, 1, { p: [0, 0.45, 0], s: [1.2, 0.8, 1], c: fol[1], sway: 1, swayY: 0.4, grad: [0.75, 1.1] });
      b.ico(0.5, 1, { p: [0.55, 0.38, 0.2], s: [1, 0.8, 1], c: fol[0], sway: 1, swayY: 0.4, grad: [0.75, 1.1] });
      break;
    case 'hedge':
      b.rbox(7.4, 0.5, 1.4, 0.12, { c: '#d9d4cc' });
      b.rbox(7.0, 0.8, 1.0, 0.3, { p: [0, 0.45, 0], c: fol[3] ?? '#5fa94a', grad: [0.75, 1.1] });
      for (let k = 0; k < 4; k++) b.ico(0.22, 0, { p: [-2.6 + k * 1.75, 1.3, 0.2], c: blossom ? '#ffffff' : '#ff8fb1' });
      break;
    case 'flowers':
      b.cyl(1.4, 1.5, 0.35, 16, { c: STONE }); b.cyl(1.3, 1.3, 0.08, 16, { p: [0, 0.3, 0], c: '#6b4a2f' });
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, r = 0.5 + (k % 3) * 0.3; b.ico(0.2, 0, { p: [Math.cos(a) * r, 0.5, Math.sin(a) * r], c: ['#ff6b8b', '#ffd43b', '#ffffff', '#c084fc'][k % 4] }); }
      b.ico(0.35, 1, { p: [0, 0.55, 0], c: fol[0] });
      break;
    case 'bench':
      b.box(1.5, 0.08, 0.45, { p: [0, 0.42, 0], c: WOOD }); b.box(1.5, 0.35, 0.07, { p: [0, 0.55, -0.2], c: WOOD });
      b.box(0.07, 0.42, 0.45, { p: [-0.65, 0, 0], c: DARKM }); b.box(0.07, 0.42, 0.45, { p: [0.65, 0, 0], c: DARKM });
      break;
    case 'hydrant':
      b.cyl(0.14, 0.17, 0.55, 8, { c: '#ff4757' }); b.sphere(0.15, 8, 5, { p: [0, 0.58, 0], c: '#ff4757' }); b.cyl(0.06, 0.06, 0.38, 6, { p: [0, 0.38, 0], r: [0, 0, Math.PI / 2], c: '#e8e8e8' });
      break;
    case 'bin':
      b.cyl(0.24, 0.21, 0.75, 10, { c: '#3aa76d' }); b.cyl(0.26, 0.26, 0.07, 10, { p: [0, 0.75, 0], c: '#2b8a57' });
      break;
    case 'busstop':
      b.box(2.4, 0.06, 1.0, { p: [0, 2.2, 0], c: '#f1f3f5' }); b.box(0.08, 2.2, 0.08, { p: [-1.1, 0, -0.4], c: METAL }); b.box(0.08, 2.2, 0.08, { p: [1.1, 0, -0.4], c: METAL });
      b.box(2.2, 1.5, 0.04, { p: [0, 0.5, -0.45], c: '#bfe3ff' }); b.box(1.6, 0.08, 0.4, { p: [0, 0.45, -0.2], c: WOOD }); b.box(0.5, 1.3, 0.06, { p: [1.25, 0.6, -0.1], c: '#ffcc33' });
      break;
    case 'dumpster':
      b.rbox(2.0, 1.1, 1.1, 0.06, { c: '#2f9e44', tint: 0 }); b.box(2.05, 0.08, 1.15, { p: [0, 1.1, 0], c: '#237032' });
      break;
    case 'fountain':
      b.cyl(2.5, 2.6, 0.55, 24, { c: STONE }); b.cyl(2.2, 2.2, 0.06, 24, { p: [0, 0.45, 0], c: '#5cc8f0' });
      b.cyl(0.35, 0.45, 1.3, 10, { c: STONE }); b.cyl(1.0, 0.7, 0.25, 16, { p: [0, 1.3, 0], c: STONE }); b.cyl(0.85, 0.85, 0.04, 16, { p: [0, 1.5, 0], c: '#7dd6f5' });
      b.cone(0.25, 0.9, 10, { p: [0, 1.5, 0], c: '#d6f3ff' });
      break;
    case 'bigfountain':
      b.cyl(3.3, 3.4, 0.6, 28, { c: STONE }); b.cyl(3.0, 3.0, 0.06, 28, { p: [0, 0.5, 0], c: '#4cc0ec' });
      b.cyl(1.6, 1.8, 0.5, 20, { p: [0, 0.4, 0], c: STONE }); b.cyl(0.4, 0.5, 1.6, 10, { p: [0, 0.6, 0], c: STONE });
      b.cyl(1.2, 0.8, 0.3, 16, { p: [0, 2.0, 0], c: STONE }); b.cyl(1.05, 1.05, 0.04, 16, { p: [0, 2.25, 0], c: '#7dd6f5' });
      b.cone(0.3, 1.2, 10, { p: [0, 2.2, 0], c: '#d6f3ff' });
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; b.cone(0.12, 0.7, 6, { p: [Math.cos(a) * 2.4, 0.5, Math.sin(a) * 2.4], c: '#c8eeff' }); }
      break;
    case 'statue':
      b.box(2.4, 0.5, 2.4, { c: STONE }); b.box(1.6, 1.2, 1.6, { p: [0, 0.5, 0], c: '#d8d2c8' });
      b.cyl(0.25, 0.32, 1.0, 8, { p: [0, 1.7, 0], c: '#c9a227' }); b.sphere(0.24, 10, 8, { p: [0, 2.95, 0], c: '#c9a227' });
      b.capsule(0.08, 0.6, 1, 6, { p: [0.32, 3.0, 0], r: [0, 0, -0.5], c: '#c9a227' }); b.ico(0.18, 0, { p: [0.58, 3.45, 0], c: '#ffd43b' });
      break;
    case 'planter':
      b.rbox(2.2, 0.7, 2.2, 0.1, { c: STONE }); b.box(1.9, 0.05, 1.9, { p: [0, 0.68, 0], c: '#6b4a2f' });
      b.ico(0.75, 1, { p: [0, 1.2, 0], c: fol[0], sway: 1, swayY: 0.8, grad: [0.8, 1.1] });
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; b.ico(0.18, 0, { p: [Math.cos(a) * 0.8, 0.85, Math.sin(a) * 0.8], c: ['#ff6b8b', '#ffd43b', '#ffffff'][k % 3] }); }
      break;
    case 'umbrella':
      b.cyl(0.6, 0.6, 0.05, 12, { p: [0, 0.72, 0], c: WHITE }); b.cyl(0.05, 0.05, 0.72, 6, { c: METAL });
      b.cyl(0.03, 0.03, 2.2, 6, { c: METAL }); b.cone(1.5, 0.55, 10, { p: [0, 2.0, 0], c: '#ffffff', tint: 1 });
      for (const [x, z] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) b.box(0.32, 0.45, 0.32, { p: [x, 0, z], c: '#f1f3f5' });
      break;
    case 'kiosk':
      b.rbox(2.4, 2.2, 1.8, 0.08, { c: '#ffffff', tint: 1 }); b.box(2.5, 0.12, 1.9, { p: [0, 2.2, 0], c: WHITE });
      b.box(2.0, 0.8, 0.05, { p: [0, 1.0, 0.9], c: '#33394a' });
      for (let k = 0; k < 6; k++) b.box(0.42, 0.06, 0.5, { p: [-1.05 + k * 0.42, 2.3, 1.05], r: [0.35, 0, 0], c: k % 2 ? '#ffffff' : '#ff6b6b' });
      break;
    case 'car': {
      b.rbox(1.8, 0.55, 3.9, 0.2, { p: [0, 0.28, 0], c: '#ffffff', tint: 1 });
      b.rbox(1.55, 0.55, 2.0, 0.2, { p: [0, 0.75, -0.2], c: '#ffffff', tint: 1 });
      b.box(1.58, 0.42, 1.7, { p: [0, 0.82, -0.2], c: '#3d5a7a' });
      b.box(1.5, 0.08, 1.85, { p: [0, 1.28, -0.2], c: '#ffffff', tint: 1 });
      for (const [x, z] of [[-0.82, 1.25], [0.82, 1.25], [-0.82, -1.25], [0.82, -1.25]]) b.cyl(0.34, 0.34, 0.26, 10, { p: [x, 0.34, z], r: [0, 0, Math.PI / 2], c: '#25272e' });
      b.box(0.36, 0.14, 0.05, { p: [-0.55, 0.45, 1.95], c: '#fff8dc' }); b.box(0.36, 0.14, 0.05, { p: [0.55, 0.45, 1.95], c: '#fff8dc' });
      b.box(0.36, 0.12, 0.05, { p: [-0.55, 0.5, -1.95], c: '#ff3b3b' }); b.box(0.36, 0.12, 0.05, { p: [0.55, 0.5, -1.95], c: '#ff3b3b' });
      break;
    }
    case 'acunit':
      b.rbox(1.3, 0.8, 1.3, 0.06, { c: '#dfe3ea' }); b.cyl(0.42, 0.42, 0.05, 14, { p: [0, 0.8, 0], c: '#7a8293' });
      break;
    case 'roofhut':
      b.box(3.0, 2.2, 2.4, { c: '#e8e2d8' }); b.box(3.2, 0.15, 2.6, { p: [0, 2.2, 0], c: '#c9c2b6' }); b.box(0.9, 1.7, 0.05, { p: [0.6, 0, 1.21], c: '#5c6b80' });
      break;
    case 'roofplanter':
      b.rbox(1.3, 0.55, 1.3, 0.08, { c: '#d9d2c6' }); b.ico(0.55, 1, { p: [0, 0.85, 0], c: fol[1], sway: 1, swayY: 0.6, grad: [0.8, 1.1] });
      break;
    case 'tank':
      b.cyl(0.9, 0.9, 1.6, 12, { p: [0, 1.0, 0], c: '#b98a5a' }); b.cone(0.95, 0.5, 12, { p: [0, 2.6, 0], c: '#8c6a4a' });
      for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) b.box(0.1, 1.0, 0.1, { p: [x, 0, z], c: DARKM });
      break;
    case 'antenna':
      b.cyl(0.05, 0.08, 4.0, 5, { c: '#d0d4dc' }); b.sphere(0.12, 6, 4, { p: [0, 4.0, 0], c: '#ff3b3b' });
      break;
    case 'parapet': break;
  }
  return b.build();
}

// rounded "+1" geometry not needed — popups are drawn on the overlay canvas
