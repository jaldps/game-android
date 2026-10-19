// Geometry builder (merge parts by material, vertex colours) + instanced Prefab pools.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M } from './materials.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  rbox: (w, h, d, r = 0.08, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01)),
  cyl: (rt, rb, h, s = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open),
  cone: (r, h, s = 12) => new THREE.ConeGeometry(r, h, s),
  sph: (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs),
  tor: (r, t, rs = 8, ts = 20, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  plane: (w, h) => new THREE.PlaneGeometry(w, h),
  ico: (r, d = 1) => new THREE.IcosahedronGeometry(r, d),
  // triangular prism (roof gable): width along x, height y, depth z
  gable: (w, h, d) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); return g; },
  tube: (pts, r, seg = 24, rs = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, rs, false),
  lathe: (pts, s = 16) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), s),
};

/** Collects parts per material key and merges them. */
export class Builder {
  constructor() { this.parts = {}; }
  add(mat, geo, color = '#ffffff', p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], uvs = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (uvs) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvs[0], uv.getY(i) * uvs[1]); }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.color) {
      _c.set(color); const ca = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { ca[i * 3] = _c.r; ca[i * 3 + 1] = _c.g; ca[i * 3 + 2] = _c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    }
    _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e); _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    (this.parts[mat] = this.parts[mat] || []).push(g);
    return this;
  }
  /** add a geometry already carrying per-vertex colours */
  addRaw(mat, g) { (this.parts[mat] = this.parts[mat] || []).push(g); return this; }
  build() { const out = {}; for (const k in this.parts) { out[k] = mergeGeometries(this.parts[k], false); out[k].computeBoundingSphere(); } return out; }
}
/** paint vertices by a function of position/normal: fn(x,y,z,nx,ny,nz) -> [r,g,b] (linear 0..1) */
export function paint(g, fn) {
  g = g.index ? g.toNonIndexed() : g; const p = g.attributes.position, n = g.attributes.normal, ca = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const c = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); ca[i * 3] = c[0]; ca[i * 3 + 1] = c[1]; ca[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); return g;
}
export function jitter(g, amt, seed = 1) {
  const p = g.attributes.position; const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = map.get(k); if (!o) { const h = (a) => (Math.sin(a * 12.9898 + seed * 78.233) * 43758.5453) % 1; const s = map.size; o = [h(s + 1) * amt, h(s + 2) * amt, h(s + 3) * amt]; map.set(k, o); }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  g.computeVertexNormals(); return g;
}

const ALL = [];
/** Instanced pool of one prefab (several material parts). */
export class Prefab {
  constructor(scene, parts, cap, { shadow = false, receive = true, tint = [] } = {}) {
    this.cap = cap; this.count = 0; this.meshes = []; this.tintable = [];
    this.slotOf = new Int32Array(cap * 2).fill(-1); this.handleAt = new Int32Array(cap); this.free = []; this.nextH = 0;
    for (const k in parts) {
      const mat = M[k]; if (!mat) { console.warn('no material', k); continue; }
      const im = new THREE.InstancedMesh(parts[k], mat, cap);
      im.count = 0; im.frustumCulled = false; im.castShadow = shadow && k !== 'window' && k !== 'lamp'; im.receiveShadow = receive;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      scene.add(im); this.meshes.push(im); this.tintable.push(tint.includes(k));
    }
    ALL.push(this);
  }
  add(x, y, z, ry = 0, s = 1, tint = null, rx = 0, rz = 0, sy = null) {
    if (this.count >= this.cap) return -1;
    const slot = this.count++;
    const h = this.free.length ? this.free.pop() : this.nextH++;
    if (h >= this.slotOf.length) { const n = new Int32Array(this.slotOf.length * 2).fill(-1); n.set(this.slotOf); this.slotOf = n; }
    this.slotOf[h] = slot; this.handleAt[slot] = h;
    this._write(slot, x, y, z, ry, s, rx, rz, sy);
    if (tint) _c.set(tint);
    for (let i = 0; i < this.meshes.length; i++) {
      const im = this.meshes[i]; im.count = this.count;
      if (this.tintable[i] && tint) im.instanceColor.setXYZ(slot, _c.r, _c.g, _c.b); else im.instanceColor.setXYZ(slot, 1, 1, 1);
      im.instanceColor.needsUpdate = true;
    }
    return h;
  }
  _write(slot, x, y, z, ry, s, rx = 0, rz = 0, sy = null) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(s, sy ?? s, s));
    for (const im of this.meshes) { im.setMatrixAt(slot, _m); im.instanceMatrix.needsUpdate = true; }
  }
  set(h, x, y, z, ry = 0, s = 1, rx = 0, rz = 0, sy = null) { const slot = this.slotOf[h]; if (slot >= 0) this._write(slot, x, y, z, ry, s, rx, rz, sy); }
  remove(h) {
    const slot = this.slotOf[h]; if (slot < 0) return;
    const last = --this.count;
    if (slot !== last) {
      const lh = this.handleAt[last];
      for (const im of this.meshes) {
        const a = im.instanceMatrix.array; a.copyWithin(slot * 16, last * 16, last * 16 + 16);
        const c = im.instanceColor.array; c.copyWithin(slot * 3, last * 3, last * 3 + 3);
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
      }
      this.handleAt[slot] = lh; this.slotOf[lh] = slot;
    }
    this.slotOf[h] = -1; this.free.push(h);
    for (const im of this.meshes) im.count = this.count;
  }
  clear() { this.count = 0; this.slotOf.fill(-1); this.free.length = 0; this.nextH = 0; for (const im of this.meshes) im.count = 0; }
  shift(dz) { for (const im of this.meshes) { const a = im.instanceMatrix.array; for (let i = 0; i < this.count; i++) a[i * 16 + 14] += dz; im.instanceMatrix.needsUpdate = true; } }
  set visible(v) { for (const im of this.meshes) im.visible = v; }
}
export function shiftAllPrefabs(dz) { for (const p of ALL) p.shift(dz); }
export function prefabDrawCalls() { let n = 0; for (const p of ALL) for (const im of p.meshes) if (im.count > 0) n++; return n; }
