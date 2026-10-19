// Object registry: every swallowable thing is an entry with one or more instanced "parts".
import * as THREE from 'three';
import { CITY } from './config.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0), _com = new THREE.Vector3();
const _lq = new THREE.Quaternion(), _rc = new THREE.Vector3(), _ax = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Pool {
  constructor(name, geo, mat, extra = {}) {
    this.name = name; this.geo = geo; this.mat = mat; this.extra = extra; this.count = 0; this.mesh = null; this.owner = [];
  }
  reserve(owner) { this.owner.push(owner); return this.count++; }
  build(scene, opts = {}) {
    const cap = Math.max(1, this.count);
    const geo = this.geo.clone();
    this.mAttr = {};
    this.extra = { aFade: 1, ...this.extra };
    for (const [k, n] of Object.entries(this.extra)) { geo.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n)); this.mAttr[k] = new Float32Array(cap * n); }
    const mesh = new THREE.InstancedMesh(geo, this.mat, cap);
    mesh.count = this.count;
    mesh.frustumCulled = false;
    mesh.castShadow = opts.cast ?? true; mesh.receiveShadow = opts.receive ?? true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.master = new Float32Array(cap * 16);
    this.mColor = new Float32Array(cap * 3).fill(1); mesh.instanceColor.array.fill(1);
    this.slot = new Int32Array(cap); for (let i = 0; i < cap; i++) this.slot[i] = i;
    this.mesh = mesh; this.dirty = true; this.colorDirty = true;
    scene.add(mesh);
    return mesh;
  }
  setMatrix(i, m) { m.toArray(this.master, i * 16); const s = this.slot[i]; if (s >= 0) { m.toArray(this.mesh.instanceMatrix.array, s * 16); this.dirty = true; } }
  hide(i) { this.master.fill(0, i * 16, i * 16 + 16); const s = this.slot[i]; if (s >= 0) { this.mesh.instanceMatrix.array.fill(0, s * 16, s * 16 + 16); this.dirty = true; } }
  setColor(i, c) { c.toArray(this.mColor, i * 3); const s = this.slot[i]; if (s >= 0) { c.toArray(this.mesh.instanceColor.array, s * 3); this.colorDirty = true; } }
  setAttr(name, i, ...v) {
    const a = this.mesh.geometry.attributes[name], ma = this.mAttr[name], n = a.itemSize;
    for (let k = 0; k < v.length; k++) ma[i * n + k] = v[k];
    const s = this.slot[i]; if (s >= 0) { for (let k = 0; k < v.length; k++) a.array[s * n + k] = v[k]; a.needsUpdate = true; }
  }
  // pack only visible instances to the front of the GPU buffers
  compact() {
    const mesh = this.mesh, M = mesh.instanceMatrix.array, C = mesh.instanceColor.array, own = this.owner;
    const attrs = Object.keys(this.mAttr).map(k => [mesh.geometry.attributes[k], this.mAttr[k]]);
    let k = 0;
    for (let i = 0; i < this.count; i++) {
      const o = own[i];
      if (!o || !o.vis) { this.slot[i] = -1; continue; }
      this.slot[i] = k;
      M.set(this.master.subarray(i * 16, i * 16 + 16), k * 16);
      C[k * 3] = this.mColor[i * 3]; C[k * 3 + 1] = this.mColor[i * 3 + 1]; C[k * 3 + 2] = this.mColor[i * 3 + 2];
      for (const [a, ma] of attrs) { const n = a.itemSize; for (let j = 0; j < n; j++) a.array[k * n + j] = ma[i * n + j]; }
      k++;
    }
    mesh.count = k;
    this.dirty = true; this.colorDirty = true; for (const [a] of attrs) a.needsUpdate = true;
  }
  flush() {
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; }
    if (this.colorDirty && this.mesh.instanceColor) { this.mesh.instanceColor.needsUpdate = true; this.colorDirty = false; }
  }
}

// Spatial hash over the platform
export const GRID = { cell: 8, n: 0, min: 0, cells: null };
export function initGrid() {
  GRID.min = -CITY.HALF - 4; GRID.n = Math.ceil((CITY.HALF * 2 + 8) / GRID.cell);
  GRID.cells = Array.from({ length: GRID.n * GRID.n }, () => []);
}
export function cellOf(x, z) {
  const cx = Math.max(0, Math.min(GRID.n - 1, Math.floor((x - GRID.min) / GRID.cell)));
  const cz = Math.max(0, Math.min(GRID.n - 1, Math.floor((z - GRID.min) / GRID.cell)));
  return cz * GRID.n + cx;
}
export function gridInsert(o) { o.cell = cellOf(o.x, o.z); GRID.cells[o.cell].push(o); }
export function gridRemove(o) { if (o.cell < 0) return; const a = GRID.cells[o.cell]; const i = a.indexOf(o); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } o.cell = -1; }
export function gridMove(o) { const c = cellOf(o.x, o.z); if (c !== o.cell) { gridRemove(o); o.cell = c; GRID.cells[c].push(o); } }
export function gridQuery(x, z, r, out) {
  out.length = 0;
  const c0 = Math.max(0, Math.floor((x - r - GRID.min) / GRID.cell)), c1 = Math.min(GRID.n - 1, Math.floor((x + r - GRID.min) / GRID.cell));
  const r0 = Math.max(0, Math.floor((z - r - GRID.min) / GRID.cell)), r1 = Math.min(GRID.n - 1, Math.floor((z + r - GRID.min) / GRID.cell));
  for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) { const a = GRID.cells[j * GRID.n + i]; for (let k = 0; k < a.length; k++) out.push(a[k]); }
  return out;
}

export const objects = [];
let nextId = 0;
/**
 * def: { type, x, z, yaw, size, h, value, mass, parts:[{pool, local:Matrix4, color?, attrs?}], decal:{w,d}|null, kind }
 */
export function addObject(def) {
  const o = Object.assign({
    id: nextId++, y: 0, yaw: 0, state: 0, cell: -1, q: new THREE.Quaternion(), lean: 0, leanX: 0, leanZ: 0,
    fall: null, moving: false, dirty: true, base: 0,
  }, def);
  for (const p of o.parts) p.id = p.pool.reserve(o);
  if (o.decal) { o.decalId = DECAL.pool.reserve(o); }
  o.vis = true;
  objects.push(o);
  return o;
}
export const DECAL = { pool: null };

// Compose world matrix for an object (rotation about its centre of mass) and write all parts.
export function writeObject(o) {
  _qy.setFromAxisAngle(_up, o.yaw);
  _q.copy(o.q);
  if (o.lean) { _lq.setFromAxisAngle(_ax.set(o.leanZ, 0, -o.leanX), o.lean); _q.premultiply(_lq); }
  _q.multiply(_qy);
  // rotate about the pivot (COM by default; tall things that topple hinge near their base)
  _com.set(0, o.h * (o.pivot ?? 0.5), 0);
  _m.compose(_p.set(o.x, o.y + o.base, o.z), _q, _s.set(1, 1, 1));
  // adjust so rotation pivots around com: pos' = pos + com - R*com
  const rc = _rc.copy(_com).applyQuaternion(_q);
  _m.elements[12] += _com.x - rc.x; _m.elements[13] += _com.y - rc.y; _m.elements[14] += _com.z - rc.z;
  for (const p of o.parts) { _m2.multiplyMatrices(_m, p.local); p.pool.setMatrix(p.id, _m2); }
  if (o.decal) {
    if (o.state === 0) {
      _m2.compose(_p.set(o.x, o.base + 0.02, o.z), _qy, _s.set(o.decal.w, 1, o.decal.d));
      DECAL.pool.setMatrix(o.decalId, _m2);
    } else DECAL.pool.hide(o.decalId);
  }
  o.dirty = false;
}
export function hideObject(o) {
  for (const p of o.parts) p.pool.hide(p.id);
  if (o.decal) DECAL.pool.hide(o.decalId);
}
export function initParts(o) {
  for (const p of o.parts) {
    if (p.color) p.pool.setColor(p.id, p.color);
    if (p.attrs) for (const [k, v] of Object.entries(p.attrs)) p.pool.setAttr(k, p.id, ...v);
  }
}
export function resetObjects() { objects.length = 0; nextId = 0; }

// Visibility pass: flag objects whose bounds touch the camera's ground footprint (+ shadow reach).
export function updateVisibility(b) {
  for (const o of objects) {
    if (o.state === 2) { o.vis = false; continue; }
    const m = o.size + 2, hh = o.h;
    o.vis = o.x > b.x0 - m - hh * 0.7 && o.x < b.x1 + m && o.z > b.z0 - m - hh * 1.2 && o.z < b.z1 + m + hh * 0.6;
  }
}
