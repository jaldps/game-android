// Procedural chibi rider + sled rigs, and the pursuing yeti. All parts merged per bone (vertex colours, one material).
import * as THREE from 'three';
import { Builder, G, paint } from './geom.js';
import { curved } from './render.js';
import { M } from './materials.js';

let charMat, glowMat, furMat;
function mats() {
  if (charMat) return;
  charMat = curved(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 })); charMat.userData.key = 'char';
  furMat = curved(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: M.fur.map })); furMat.userData.key = 'yfur';
  glowMat = curved(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, emissive: '#ffffff', emissiveIntensity: 0.0 })); glowMat.userData.key = 'sledglow';
}
const C = c => new THREE.Color(c);
function mesh(B, mat = charMat, shadow = true) {
  const parts = B.build(); const grp = new THREE.Group();
  for (const k in parts) { const m = new THREE.Mesh(parts[k], k === 'fur' ? furMat : k === 'glow' ? glowMat : mat); m.castShadow = shadow; m.receiveShadow = false; m.frustumCulled = false; grp.add(m); }
  return grp;
}
// quilted puffer: lathe painted with darker seams every few cm
function puffer(profile, col, col2, seams = 0.09, seg = 18) {
  let g = G.lathe(profile, seg).toNonIndexed(); const a = C(col), b = C(col2);
  g = paint(g, (x, y) => { const s = Math.abs(((y / seams) % 1 + 1) % 1 - 0.5); return s < 0.1 ? [b.r, b.g, b.b] : [a.r, a.g, a.b]; });
  return g;
}
// bent board along a 2D (z,y) polyline, width in x, thickness t
function bentBoard(pts, w, t) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    let dz = q[0] - o[0], dy = q[1] - o[1]; const l = Math.hypot(dz, dy) || 1; dz /= l; dy /= l; const nz = -dy, ny = dz; // normal
    for (const [sx, st] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) pos.push(sx * w / 2, p[1] + ny * st * t / 2, p[0] + nz * st * t / 2);
  }
  for (let i = 0; i < pts.length - 1; i++) { const a = i * 4, b = a + 4; for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; idx.push(a + k, b + k, a + k2, a + k2, b + k, b + k2); } }
  const n = pts.length - 1; idx.push(0, 1, 2, 0, 2, 3, n * 4, n * 4 + 2, n * 4 + 1, n * 4, n * 4 + 3, n * 4 + 2);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2)); return ng;
}

export function buildSled(def) {
  mats();
  const B = new Builder(); const glow = !!def.glow;
  const deckPts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; const z = 0.78 - t * 1.45; let y = 0.3; if (z < -0.35) { const k = (-0.35 - z) / 0.32; y = 0.3 + k * k * 0.32; } deckPts.push([z, y]); }
  for (let i = 1; i <= 8; i++) { const a = i / 8 * Math.PI * 0.95; deckPts.push([-0.67 - Math.sin(a) * 0.18, 0.62 + (1 - Math.cos(a)) * 0.18]); }
  const deck = bentBoard(deckPts, 0.78, 0.07);
  const wc = C(def.wood); B.addRaw(glow ? 'glow' : 'char', paint(deck, (x, y, z) => { const slat = Math.abs(((x + 0.39) / 0.195) % 1 - 0.5) > 0.45 ? 0.6 : 1; return [wc.r * slat, wc.g * slat, wc.b * slat]; }));
  // side rails + rope
  for (const s of [-1, 1]) {
    B.add('char', G.box(0.06, 0.08, 1.2), def.trim, [s * 0.4, 0.38, 0.1]);
    B.add('char', G.tube([[s * 0.4, 0.42, 0.6], [s * 0.43, 0.52, 0.2], [s * 0.43, 0.5, -0.3], [s * 0.36, 0.72, -0.62]], 0.022, 16, 5), '#e8dcc0');
    // runners: curl up at the front
    B.add('char', G.tube([[s * 0.32, 0.1, 0.85], [s * 0.32, 0.08, 0.2], [s * 0.32, 0.1, -0.5], [s * 0.32, 0.3, -0.85], [s * 0.32, 0.55, -0.85], [s * 0.32, 0.52, -0.62]], 0.035, 24, 6), def.runner);
    for (const z of [0.55, -0.05, -0.55]) B.add('char', G.box(0.05, 0.22, 0.06), def.runner, [s * 0.32, 0.2, z]);
  }
  B.add('char', G.tube([[-0.36, 0.72, -0.62], [0, 0.6, -0.6], [0.36, 0.72, -0.62]], 0.022, 12, 5), '#e8dcc0');
  const g = mesh(B); if (glow) g.children.forEach(m => { if (m.material === glowMat) { m.material = glowMat.clone(); m.material.emissive.set(def.glow); m.material.emissiveIntensity = 0.35; } });
  return g;
}

export function buildRider(def) {
  mats();
  const rig = { root: new THREE.Group() };
  const body = new THREE.Group(); rig.body = body; rig.root.add(body);
  body.position.set(0, 0.42, 0.22);
  // --- legs (static relative to pelvis) ---
  const L = new Builder();
  L.addRaw('char', puffer([[0, -0.05], [0.2, -0.04], [0.27, 0.06], [0.27, 0.18], [0.2, 0.26], [0, 0.27]], def.pants, def.pants, 1, 14));
  for (const s of [-1, 1]) {
    L.add('char', G.cyl(0.1, 0.11, 0.42, 10), def.pants, [s * 0.13, 0.14, -0.2], [-1.25, 0, 0]);
    L.add('char', G.cyl(0.09, 0.1, 0.36, 10), def.pants, [s * 0.14, 0.12, -0.52], [-1.95, 0, 0]);
    L.add('char', G.rbox(0.17, 0.17, 0.3, 0.07), '#4a2f22', [s * 0.14, 0.04, -0.7]);
    L.add('char', G.rbox(0.19, 0.06, 0.32, 0.03), '#2b1d16', [s * 0.14, -0.04, -0.72]);
    L.add('char', G.cyl(0.11, 0.11, 0.08, 10), '#f4f0e8', [s * 0.14, 0.14, -0.62], [-1.95, 0, 0]);
  }
  rig.legs = mesh(L); body.add(rig.legs);
  // --- torso (pivot at hips) ---
  const torso = new THREE.Group(); torso.position.set(0, 0.12, 0); body.add(torso); rig.torso = torso;
  const T = new Builder();
  T.addRaw('char', puffer([[0, 0], [0.27, 0.0], [0.33, 0.12], [0.35, 0.3], [0.32, 0.48], [0.22, 0.6], [0, 0.62]], def.parka, def.parka2, 0.11, 18));
  T.add('char', G.box(0.04, 0.5, 0.04), def.parka2, [0, 0.3, -0.33]);  // zipper
  T.add('char', G.tor(0.21, 0.08, 8, 18), '#f7f2ea', [0, 0.6, 0], [Math.PI / 2, 0, 0], [1, 1, 1]);  // fur collar
  T.add('char', G.tor(0.3, 0.05, 6, 18), def.parka2, [0, 0.03, 0], [Math.PI / 2, 0, 0]);
  // backpack (faces the chase cam)
  T.add('char', G.rbox(0.42, 0.42, 0.2, 0.08), def.bag, [0, 0.33, 0.32]);
  T.add('char', G.rbox(0.3, 0.16, 0.08, 0.04), C(def.bag).multiplyScalar(0.7), [0, 0.22, 0.43]);
  T.add('char', G.cyl(0.07, 0.07, 0.03, 12), '#ffffff', [0.0, 0.43, 0.43], [Math.PI / 2, 0, 0]);
  T.add('char', G.cyl(0.045, 0.045, 0.035, 5), def.scarf, [0.0, 0.43, 0.445], [Math.PI / 2, 0, 0]);
  T.add('char', G.rbox(0.44, 0.1, 0.14, 0.04), '#d8c9a8', [0, 0.58, 0.3]);  // rolled blanket on top
  for (const s of [-1, 1]) T.add('char', G.box(0.05, 0.4, 0.03), C(def.bag).multiplyScalar(0.6), [s * 0.15, 0.36, 0.215]);
  rig.torsoMesh = mesh(T); torso.add(rig.torsoMesh);
  // --- head ---
  const head = new THREE.Group(); head.position.set(0, 0.66, 0); torso.add(head); rig.head = head;
  const H = new Builder(); const r = 0.3;
  H.add('char', G.sph(r, 22, 16), def.skin, [0, r * 0.95, 0]);
  // face (on -Z)
  for (const s of [-1, 1]) {
    H.add('char', G.sph(0.055, 10, 8), '#1a1420', [s * 0.11, r * 0.98, -r * 0.88], [0, 0, 0], [0.85, 1.15, 0.6]);
    H.add('char', G.sph(0.018, 6, 5), '#ffffff', [s * 0.11 + 0.015, r * 1.03, -r * 0.94]);
    H.add('char', G.sph(0.05, 8, 6), '#ff8f8f', [s * 0.19, r * 0.8, -r * 0.8], [0, 0, 0], [1, 0.6, 0.4]);
    H.add('char', G.box(0.09, 0.02, 0.02), C(def.hair), [s * 0.11, r * 1.2, -r * 0.88], [0, 0, s * -0.15]);
  }
  H.add('char', G.sph(0.045, 8, 6), C(def.skin).multiplyScalar(0.9).offsetHSL(0, 0.05, 0), [0, r * 0.88, -r * 0.98]);
  H.add('char', G.tor(0.05, 0.014, 5, 10, Math.PI), '#7a2a2a', [0, r * 0.74, -r * 0.92], [0, 0, Math.PI]);
  // hair at the back/sides
  H.add('char', G.sph(r * 1.02, 18, 12, ), def.hair, [0, r * 0.98, 0.04], [0, 0, 0], [1, 0.9, 0.95]);
  // hats
  const hat = def.hatType;
  if (hat === 'beanie' || hat === 'dino' || hat === 'bunny') {
    const capR = r * 1.08;
    let cap = new THREE.SphereGeometry(capR, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55).toNonIndexed();
    const a = C(def.hat), b = C(def.hat2);
    cap = paint(cap, (x, y) => hat === 'beanie' ? (Math.abs(((y / 0.07) % 1 + 1) % 1 - 0.5) < 0.18 ? [b.r, b.g, b.b] : [a.r, a.g, a.b]) : [a.r, a.g, a.b]);
    cap.translate(0, r * 1.0, 0.0); H.addRaw('char', cap);
    if (hat === 'beanie') {
      H.add('char', G.tor(capR * 0.93, 0.07, 8, 22), def.hat2, [0, r * 1.02, 0.0], [Math.PI / 2 - 0.12, 0, 0]);
      H.add('char', G.ico(0.13, 1), def.hat2, [0, r * 2.05, 0.05]);
    } else if (hat === 'dino') {
      H.add('char', G.tor(capR * 0.93, 0.06, 8, 22), def.hat2, [0, r * 1.02, 0.0], [Math.PI / 2 - 0.12, 0, 0]);
      for (let i = 0; i < 5; i++) { const ang = -0.6 + i * 0.45; H.add('char', G.cone(0.07, 0.16, 6), def.hat2, [0, r + Math.cos(ang) * capR * 1.02, Math.sin(ang) * capR * 1.02], [ang, 0, 0]); }
      for (const s of [-1, 1]) { H.add('char', G.sph(0.06, 8, 6), '#fff', [s * 0.13, r * 1.55, -r * 0.82]); H.add('char', G.sph(0.03, 6, 5), '#111', [s * 0.13, r * 1.56, -r * 0.88]); }
    } else {
      for (const s of [-1, 1]) { H.add('char', G.cyl(0.07, 0.09, 0.42, 10), def.hat, [s * 0.13, r * 2.25, 0.05], [0.25, 0, s * -0.25], [1, 1, 0.6]); H.add('char', G.cyl(0.035, 0.05, 0.34, 8), def.hat2, [s * 0.135, r * 2.25, -0.0], [0.25, 0, s * -0.25], [1, 1, 0.5]); }
    }
  } else if (hat === 'muffs') {
    H.add('char', G.tor(r * 1.05, 0.035, 6, 20, Math.PI), def.hat, [0, r * 1.0, 0], [0, Math.PI / 2, 0]);
    for (const s of [-1, 1]) H.add('char', G.sph(0.11, 12, 10), def.hat2, [s * r * 1.02, r * 0.95, 0], [0, 0, 0], [0.7, 1, 1]);
    H.add('char', G.sph(0.12, 10, 8), def.hair, [0, r * 1.25, 0.32]);  // bun
    H.add('char', G.cyl(0.07, 0.03, 0.4, 8), def.hair, [0, r * 0.95, 0.42], [0.5, 0, 0]);  // ponytail
  } else if (hat === 'aviator') {
    let cap = new THREE.SphereGeometry(r * 1.07, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.58).toNonIndexed(); const a = C(def.hat); cap = paint(cap, () => [a.r, a.g, a.b]); cap.translate(0, r, 0); H.addRaw('char', cap);
    for (const s of [-1, 1]) H.add('char', G.rbox(0.08, 0.26, 0.18, 0.04), def.hat2, [s * r * 1.02, r * 0.75, 0.02]);
    H.add('char', G.tor(r * 0.98, 0.05, 6, 20), def.hat2, [0, r * 1.06, 0], [Math.PI / 2 - 0.25, 0, 0]);
    H.add('char', G.tor(r * 1.0, 0.03, 6, 20), '#3a3a44', [0, r * 1.35, 0], [Math.PI / 2 + 0.3, 0, 0]);
    for (const s of [-1, 1]) H.add('char', G.cyl(0.08, 0.08, 0.05, 12), '#7fd6ff', [s * 0.11, r * 1.5, -r * 0.82], [Math.PI / 2 + 0.6, 0, 0]);
  }
  rig.headMesh = mesh(H); head.add(rig.headMesh);
  // scarf wrap (on torso top) + dynamic tail
  const S = new Builder(); S.add('char', G.tor(0.2, 0.075, 8, 18), def.scarf, [0, 0.66, 0], [Math.PI / 2, 0, 0]); S.add('char', G.tor(0.2, 0.025, 6, 18), '#ffffff', [0, 0.63, 0], [Math.PI / 2, 0, 0]);
  torso.add(mesh(S));
  const NT = 7; const tg = new THREE.BufferGeometry(); const tpos = new Float32Array(NT * 2 * 3); tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
  const tcol = new Float32Array(NT * 2 * 3); const sc = C(def.scarf), wc2 = C('#ffffff'); for (let i = 0; i < NT * 2; i++) { const k = Math.floor(i / 2); const c = (k % 3 === 2) ? wc2 : sc; tcol.set([c.r, c.g, c.b], i * 3); }
  tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3)); const ti = []; for (let i = 0; i < NT - 1; i++) { const a = i * 2; ti.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } tg.setIndex(ti);
  const tailMat = charMat.clone(); tailMat.side = THREE.DoubleSide; tailMat.onBeforeCompile = charMat.onBeforeCompile; tailMat.customProgramCacheKey = charMat.customProgramCacheKey;
  rig.tail = new THREE.Mesh(tg, tailMat); rig.tail.frustumCulled = false; rig.tail.castShadow = true; rig.root.add(rig.tail); rig.tailN = NT;
  rig.tailPts = Array.from({ length: NT }, () => new THREE.Vector3());
  // arms: shoulder pivots
  rig.arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.3, 0.5, 0.0); torso.add(sh);
    const A = new Builder(); A.addRaw('char', puffer([[0, 0.02], [0.1, 0], [0.11, -0.12], [0.1, -0.26], [0.08, -0.32], [0, -0.33]], def.parka, def.parka2, 0.1, 10));
    const up = mesh(A); sh.add(up);
    const el = new THREE.Group(); el.position.set(0, -0.3, 0); sh.add(el);
    const F = new Builder(); F.addRaw('char', puffer([[0, 0.0], [0.09, -0.01], [0.09, -0.2], [0.075, -0.24], [0, -0.25]], def.parka, def.parka2, 0.1, 10));
    F.add('char', G.tor(0.07, 0.035, 6, 12), '#f7f2ea', [0, -0.22, 0], [Math.PI / 2, 0, 0]);
    F.add('char', G.sph(0.085, 12, 10), def.hat === '#ffffff' ? def.scarf : def.scarf, [0, -0.3, 0], [0, 0, 0], [1, 1.1, 0.9]);
    F.add('char', G.sph(0.04, 8, 6), def.scarf, [s * -0.06, -0.27, -0.03]);
    el.add(mesh(F));
    rig.arms.push({ sh, el, s });
  }
  rig.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return rig;
}

// --- animate rider; st: {t, lean, air, vy, duck, stumble, kite, idle, wave, speed, crash} ---
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
export function poseRider(rig, st, dt) {
  const t = st.t;
  const bob = Math.sin(t * 9) * 0.012 * (st.idle ? 0.3 : 1);
  const b = rig.body, T = rig.torso, H = rig.head;
  const duck = st.duck || 0, air = st.air ? 1 : 0;
  b.position.y = 0.42 + bob;
  b.rotation.set(0, 0, -st.lean * 0.18);
  T.rotation.x = duck * 1.15 - (st.idle ? 0.05 : 0.12) + air * -0.15 + (st.stumble ? Math.sin(t * 30) * 0.15 : 0);
  T.rotation.z = -st.lean * 0.3 + (st.stumble ? Math.sin(t * 22) * 0.2 : 0) + (st.idle ? Math.sin(t * 1.3) * 0.04 : 0);
  T.rotation.y = st.idle ? Math.sin(t * 0.7) * 0.15 : st.lean * 0.12;
  H.rotation.x = -duck * 0.8 + (st.idle ? Math.sin(t * 0.9) * 0.08 : 0.08) + air * 0.1;
  H.rotation.z = st.lean * 0.38 + (st.idle ? Math.sin(t * 1.7) * 0.07 : 0);
  H.rotation.y = st.idle ? Math.sin(t * 0.5) * 0.5 : -st.lean * 0.2;
  // arms
  for (const a of rig.arms) {
    const s = a.s;
    let shX, shZ, elX;
    if (st.kite) { shX = -2.9; shZ = s * 0.25; elX = -0.2; }
    else if (st.stumble) { shX = -1.5 + Math.sin(t * 25 + s) * 1.0; shZ = s * (0.9 + Math.sin(t * 19 + s * 2) * 0.5); elX = -0.8; }
    else if (st.wave && s > 0) { shX = -2.6; shZ = 0.5 + Math.sin(t * 9) * 0.35; elX = -0.6 + Math.sin(t * 9) * 0.3; }
    else if (air) { const k = THREE.MathUtils.clamp(st.vy / 10, -1, 1); shX = -1.0 - k * 0.6; shZ = s * (1.1 + 0.25 * Math.sin(t * 8)); elX = -0.5; }
    else if (duck > 0.3) { shX = -0.2; shZ = s * 0.35; elX = -0.4; }
    else { shX = -0.95 - st.lean * s * 0.25; shZ = s * 0.22; elX = -0.75 + Math.sin(t * 9 + s) * 0.05; }
    if (st.idle && !(st.wave && s > 0)) { shX = -0.35; shZ = s * 0.25; elX = -1.1; }
    a.sh.rotation.x += (shX - a.sh.rotation.x) * Math.min(1, dt * 14);
    a.sh.rotation.z += (shZ - a.sh.rotation.z) * Math.min(1, dt * 14);
    a.el.rotation.x += (elX - a.el.rotation.x) * Math.min(1, dt * 14);
  }
  // scarf tail: chain trailing behind the neck, fluttering
  rig.root.updateMatrixWorld(true);
  _v.set(0, 0.62, 0.14); T.localToWorld(_v);
  const pts = rig.tailPts, sp = (st.speed || 0) * 0.04 + 0.3;
  pts[0].copy(_v);
  for (let i = 1; i < pts.length; i++) {
    const k = i / (pts.length - 1);
    _w.set(Math.sin(t * 13 - i * 1.1) * 0.06 * k + st.lean * 0.15 * k, -0.04 * i * (1.2 - sp * 0.6) + Math.sin(t * 17 - i * 1.4) * 0.05 * k, 0.11 * sp * 1.6);
    _w.applyQuaternion(rig.root.quaternion);
    const target = _v.set(pts[i - 1].x + _w.x, pts[i - 1].y + _w.y, pts[i - 1].z + 0.12 + _w.z * 0.6);
    if (st.reset) pts[i].copy(target); else pts[i].lerp(target, Math.min(1, dt * 30));
    // keep segment length
    const d = pts[i].distanceTo(pts[i - 1]); if (d > 0.15) pts[i].sub(pts[i - 1]).multiplyScalar(0.15 / d).add(pts[i - 1]);
  }
  rig.root.worldToLocal; // positions written in root-local space
  const arr = rig.tail.geometry.attributes.position.array, inv = rig._inv || (rig._inv = new THREE.Matrix4());
  inv.copy(rig.root.matrixWorld).invert();
  for (let i = 0; i < pts.length; i++) {
    _v.copy(pts[i]).applyMatrix4(inv); const wdt = 0.075 * (1 - i / pts.length * 0.3);
    arr[i * 6] = _v.x - wdt; arr[i * 6 + 1] = _v.y; arr[i * 6 + 2] = _v.z; arr[i * 6 + 3] = _v.x + wdt; arr[i * 6 + 4] = _v.y - 0.01; arr[i * 6 + 5] = _v.z;
  }
  rig.tail.geometry.attributes.position.needsUpdate = true; rig.tail.geometry.computeVertexNormals();
}

// ------------- YETI -------------
export function buildYeti() {
  mats();
  const y = { root: new THREE.Group() };
  const body = new THREE.Group(); y.root.add(body); y.body = body;
  const B = new Builder();
  const fur = C('#f2f5ff'), furD = C('#c9d3ea');
  let torso = new THREE.SphereGeometry(1, 20, 16).toNonIndexed();
  const p = torso.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), yy = p.getY(i), z = p.getZ(i); const n = 1 + 0.06 * Math.sin(x * 9 + yy * 7) * Math.cos(z * 8 - yy * 5); p.setXYZ(i, x * n, yy * n, z * n); }
  torso.computeVertexNormals(); torso = paint(torso, (x, yy, z, nx, ny) => ny < -0.4 ? [furD.r, furD.g, furD.b] : [fur.r, fur.g, fur.b]);
  torso.scale(0.95, 1.05, 0.8); torso.translate(0, 1.55, 0); B.addRaw('fur', torso);
  // belly patch + face patch (blue-grey skin)
  B.add('char', G.sph(0.55, 16, 12), '#8fa6c9', [0, 1.4, -0.6], [0, 0, 0], [1, 1.1, 0.4]);
  y.bodyMesh = mesh(B); body.add(y.bodyMesh);
  const head = new THREE.Group(); head.position.set(0, 2.55, -0.1); body.add(head); y.head = head;
  const H = new Builder();
  let hg = new THREE.SphereGeometry(0.62, 18, 14).toNonIndexed(); hg = paint(hg, () => [fur.r, fur.g, fur.b]); H.addRaw('fur', hg);
  H.add('char', G.sph(0.42, 16, 12), '#7f97bd', [0, -0.05, -0.36], [0, 0, 0], [1.05, 0.9, 0.6]);
  for (const s of [-1, 1]) {
    H.add('char', G.sph(0.1, 10, 8), '#ffffff', [s * 0.17, 0.05, -0.62]); H.add('char', G.sph(0.055, 8, 6), '#141020', [s * 0.15, 0.04, -0.7]);
    H.add('char', G.box(0.26, 0.07, 0.08), '#3b4a66', [s * 0.17, 0.2, -0.64], [0, 0, s * 0.35]);
    H.add('char', G.cone(0.1, 0.4, 8), '#e8d9b8', [s * 0.48, 0.42, -0.05], [0, 0, s * -0.7]);
  }
  H.add('char', G.sph(0.2, 12, 8), '#5a2030', [0, -0.25, -0.62], [0, 0, 0], [1.1, 0.6, 0.5]);
  for (const s of [-1, 1]) H.add('char', G.cone(0.04, 0.1, 5), '#ffffff', [s * 0.09, -0.17, -0.7], [Math.PI, 0, 0]);
  head.add(mesh(H));
  y.arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.85, 2.0, 0); body.add(sh);
    const A = new Builder(); let ag = new THREE.CylinderGeometry(0.3, 0.24, 1.5, 12).toNonIndexed(); ag = paint(ag, () => [fur.r, fur.g, fur.b]); ag.translate(0, -0.75, 0); A.addRaw('fur', ag);
    A.add('char', G.sph(0.27, 12, 10), '#7f97bd', [0, -1.55, -0.05], [0, 0, 0], [1, 0.8, 1.2]);
    for (let k = -1; k <= 1; k++) A.add('char', G.cone(0.05, 0.16, 5), '#e8e0d0', [k * 0.1, -1.72, -0.2], [-1.2, 0, 0]);
    sh.add(mesh(A)); y.arms.push({ sh, s });
  }
  y.legs = [];
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.45, 0.8, 0); body.add(hp);
    const Lg = new Builder(); let lg = new THREE.CylinderGeometry(0.32, 0.28, 0.8, 12).toNonIndexed(); lg = paint(lg, () => [furD.r, furD.g, furD.b]); lg.translate(0, -0.4, 0); Lg.addRaw('fur', lg);
    Lg.add('char', G.sph(0.33, 12, 8), '#7f97bd', [0, -0.78, -0.12], [0, 0, 0], [1, 0.45, 1.4]);
    hp.add(mesh(Lg)); y.legs.push({ hp, s });
  }
  y.root.scale.setScalar(0.85);
  return y;
}
export function poseYeti(y, st, dt) {
  const t = st.t, run = st.run ?? 1, f = 11;
  y.body.position.y = Math.abs(Math.sin(t * f)) * 0.25 * run;
  y.body.rotation.x = -0.25 * run + Math.sin(t * f * 2) * 0.05;
  for (const a of y.arms) { a.sh.rotation.x = st.grab ? -2.2 : Math.sin(t * f + (a.s > 0 ? 0 : Math.PI)) * 1.1 * run - 0.2; a.sh.rotation.z = a.s * (st.grab ? 0.3 : 0.25); }
  for (const l of y.legs) l.hp.rotation.x = Math.sin(t * f + (l.s > 0 ? Math.PI : 0)) * 0.9 * run;
  y.head.rotation.x = Math.sin(t * f * 2) * 0.08 + (st.roar ? -0.4 : 0);
  y.head.rotation.z = Math.sin(t * 3) * 0.1;
}
