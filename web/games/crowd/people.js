// Crowd renderer: one instanced draw for bodies, one for blob shadows, per-leader hats. Only agents in view are uploaded.
import * as THREE from 'three';
import { SIM } from './config.js';
import { A, teams } from './sim.js';
import { person, hat as hatGeo } from './geom.js';
import { peopleMaterial, blobMaterial } from './materials.js';

const N = SIM.MAX;
let body = null, blob = null, iPos, iCol, iAnim;
const hats = [];
export const NEUTRAL = new THREE.Color('#eceff6');
const LEADER_SCALE = 1.4;

export function initPeople(scene, lo) {
  const base = person(lo);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
  iPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); iPos.setUsage(THREE.DynamicDrawUsage);
  iCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); iCol.setUsage(THREE.DynamicDrawUsage);
  iAnim = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); iAnim.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iPos', iPos); g.setAttribute('iCol', iCol); g.setAttribute('iAnim', iAnim);
  g.instanceCount = 0;
  body = new THREE.Mesh(g, peopleMaterial()); body.frustumCulled = false; body.castShadow = false; body.receiveShadow = true;
  scene.add(body);
  const bg = new THREE.InstancedBufferGeometry(); const pl = new THREE.PlaneGeometry(0.75, 0.75); pl.rotateX(-Math.PI / 2);
  bg.index = pl.index; for (const k in pl.attributes) bg.setAttribute(k, pl.attributes[k]);
  bg.setAttribute('iPos', iPos); bg.setAttribute('iAnim', iAnim); bg.instanceCount = 0;
  blob = new THREE.Mesh(bg, blobMaterial()); blob.frustumCulled = false; blob.renderOrder = 1; scene.add(blob);
}
export function disposeHats(scene) { for (const h of hats) { scene.remove(h); h.geometry.dispose(); } hats.length = 0; }
export function setupHats(scene) {
  disposeHats(scene);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3, envMapIntensity: 1.2 });
  for (const t of teams) {
    const m = new THREE.Mesh(hatGeo(t.isPlayer ? t.hat : 'none'), mat); m.castShadow = true; m.scale.setScalar(LEADER_SCALE); scene.add(m); hats.push(m);
  }
}

const _c = new THREE.Color();
export function updatePeople(vb, t) {
  const P = iPos.array, C = iCol.array, An = iAnim.array; let n = 0;
  for (let i = 0; i < N; i++) {
    const tm = A.team[i]; if (tm === -2) continue;
    const x = A.x[i], z = A.z[i];
    if (x < vb.x0 || x > vb.x1 || z < vb.z0 || z > vb.z1) continue;
    const o = n * 4;
    P[o] = x; P[o + 1] = A.y[i]; P[o + 2] = z; P[o + 3] = A.yaw[i];
    let r, g, b;
    if (tm >= 0) { const c = teams[tm].color; r = c.r; g = c.g; b = c.b; } else { r = NEUTRAL.r; g = NEUTRAL.g; b = NEUTRAL.b; }
    C[o] = r; C[o + 1] = g; C[o + 2] = b; C[o + 3] = A.flash[i] * 0.85;
    const hop = A.hop[i]; const hopv = hop > 0 ? Math.sin((1 - hop) * Math.PI) : 0;
    let sc = A.leader[i] ? LEADER_SCALE : 1;
    if (A.fade[i] > 0) sc *= 1 - A.fade[i];
    An[o] = A.phase[i]; An[o + 1] = A.run[i]; An[o + 2] = sc; An[o + 3] = hopv * 0.5;
    n++;
  }
  body.geometry.instanceCount = n; blob.geometry.instanceCount = n;
  iPos.clearUpdateRanges(); iCol.clearUpdateRanges(); iAnim.clearUpdateRanges();
  iPos.addUpdateRange(0, n * 4); iCol.addUpdateRange(0, n * 4); iAnim.addUpdateRange(0, n * 4);
  iPos.needsUpdate = true; iCol.needsUpdate = true; iAnim.needsUpdate = true;
  // hats follow leaders
  for (let k = 0; k < hats.length; k++) {
    const T = teams[k]; const h = hats[k]; if (!T) { h.visible = false; continue; }
    h.visible = T.alive; if (!T.alive) continue;
    const L = T.leader; const bob = Math.abs(Math.cos(A.phase[L])) * 0.07 * (0.3 + A.run[L]) * LEADER_SCALE;
    h.position.set(A.x[L], A.y[L] + bob, A.z[L]);
    h.rotation.set(0.18 * A.run[L], A.yaw[L], 0, 'YXZ');
    if (T.hat === 'halo' || !T.isPlayer) h.rotation.y += t * 1.2;
  }
  return n;
}
