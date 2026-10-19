// Particle bursts (dust puffs, sparkles, confetti) — one instanced mesh, pooled.
import * as THREE from 'three';

const N = 620;
let mesh = null; const P = [];
let shaftMesh = null, shaftT = 0, shaftMax = 1;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
let head = 0;

export function initFx(scene) {
  const g = new THREE.OctahedronGeometry(0.5, 0);
  const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
  mesh = new THREE.InstancedMesh(g, m, N); mesh.frustumCulled = false; mesh.renderOrder = 5;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < N; i++) { P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, g: 0, rx: 0, ry: 0, spin: 0 }); mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); mesh.setColorAt(i, _c.set(1, 1, 1)); }
  scene.add(mesh);
  // god-ray column that stabs out of the pit when a set-piece goes down
  const cg = new THREE.CylinderGeometry(1, 0.42, 1, 24, 1, true); cg.translate(0, 0.5, 0);
  shaftMesh = new THREE.Mesh(cg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uA: { value: 0 }, uCol: { value: new THREE.Color('#bfe6ff') }, uT: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform float uA; uniform vec3 uCol; uniform float uT;
      void main(){ float h = clamp(vP.y, 0.0, 1.0);
        float a = uA * (1.0 - h) * (0.35 + 0.65*pow(1.0-h, 2.0));
        float ang = atan(vP.z, vP.x);
        a *= 0.55 + 0.45*sin(ang*9.0 + uT*1.6)*0.5 + 0.22;
        gl_FragColor = vec4(uCol, clamp(a, 0.0, 1.0)); }`,
  }));
  shaftMesh.renderOrder = 6; shaftMesh.frustumCulled = false; shaftMesh.visible = false;
  scene.add(shaftMesh);
}
export function resetFx() { for (let i = 0; i < N; i++) { P[i].life = 0; mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); } mesh.instanceMatrix.needsUpdate = true; if (shaftMesh) { shaftMesh.visible = false; shaftT = 0; } }
export function lightShaft(x, z, r, color = '#cfeaff', dur = 3.2) {
  if (!shaftMesh) return;
  shaftMesh.visible = true; shaftT = shaftMax = dur;
  shaftMesh.position.set(x, 0.2, z);
  shaftMesh.scale.set(r * 1.05, r * 7.5 + 40, r * 1.05);
  shaftMesh.material.uniforms.uCol.value.set(color);
}

function emit(x, y, z, vx, vy, vz, life, s, color, g = 0) {
  const p = P[head]; const i = head; head = (head + 1) % N;
  Object.assign(p, { life, max: life, x, y, z, vx, vy, vz, s, g, rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 10 });
  mesh.setColorAt(i, _c.set(color));
}

export function puff(x, z, r, size) {
  const n = Math.min(10, 3 + Math.floor(size * 2));
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, rr = r * (0.7 + Math.random() * 0.4);
    emit(x + Math.cos(a) * rr, 0.3, z + Math.sin(a) * rr, Math.cos(a) * 0.5, 1.5 + Math.random() * 2, Math.sin(a) * 0.5, 0.5 + Math.random() * 0.4, (0.15 + size * 0.08) * (0.6 + Math.random()), Math.random() < 0.5 ? '#f3e6cf' : '#ffffff', -2);
  }
}
export function stars(x, z, r, n) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, rr = r * Math.random() * 0.8;
    emit(x + Math.cos(a) * rr, 0.6, z + Math.sin(a) * rr, Math.cos(a) * 1.5, 4 + Math.random() * 5, Math.sin(a) * 1.5, 0.7 + Math.random() * 0.4, 0.14 + r * 0.035, Math.random() < 0.7 ? '#ffd84a' : '#ffffff', -9);
  }
}
export function sparkleRing(x, z, r, color) {
  for (let k = 0; k < 36; k++) {
    const a = k / 36 * Math.PI * 2;
    emit(x + Math.cos(a) * r, 0.4, z + Math.sin(a) * r, Math.cos(a) * r * 0.6, 3 + Math.random() * 4, Math.sin(a) * r * 0.6, 0.9 + Math.random() * 0.5, 0.18 + r * 0.05, k % 3 === 0 ? '#ffffff' : (k % 3 === 1 ? '#ffe066' : color), -5);
  }
}
/** Heavy, slow dust cloud — what a building collapsing into a pit actually throws up. */
export function plume(x, z, r, size) {
  const n = Math.min(26, 8 + Math.floor(size * 2.2));
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, rr = r * (0.55 + Math.random() * 0.75);
    emit(x + Math.cos(a) * rr, 0.2 + Math.random() * size * 0.5, z + Math.sin(a) * rr,
      Math.cos(a) * (1.5 + size * 0.6), 1.0 + Math.random() * 2.4, Math.sin(a) * (1.5 + size * 0.6),
      1.1 + Math.random() * 0.9, (0.42 + size * 0.2) * (0.7 + Math.random() * 0.7),
      Math.random() < 0.45 ? '#cdbfa6' : (Math.random() < 0.5 ? '#e8ddc9' : '#b6a894'), -1.2);
  }
}
/** Chunks of masonry kicked out of the collapse. */
export function debris(x, z, r, size) {
  const n = Math.min(22, 6 + Math.floor(size * 1.8));
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * (4 + size * 1.6);
    emit(x + Math.cos(a) * r * 0.5, 0.5 + Math.random() * 1.5, z + Math.sin(a) * r * 0.5,
      Math.cos(a) * sp, 4 + Math.random() * (5 + size), Math.sin(a) * sp,
      1.0 + Math.random() * 0.7, 0.16 + size * 0.075,
      ['#a89b8a', '#8e8275', '#c2b4a0', '#6f6558'][k % 4], -22);
  }
}

export function burst(x, z, r, color) {
  for (let k = 0; k < 60; k++) {
    const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 10;
    emit(x, 0.5, z, Math.cos(a) * sp, 6 + Math.random() * 10, Math.sin(a) * sp, 1.2 + Math.random() * 0.6, 0.25 + r * 0.06, k % 2 ? color : (k % 3 ? '#ffffff' : '#ffd23f'), -16);
  }
}

export function updateFx(dt) {
  let any = false;
  if (shaftT > 0) {
    shaftT -= dt;
    const t = Math.max(0, shaftT / shaftMax);
    const u = shaftMesh.material.uniforms;
    u.uA.value = Math.min(1, t * 2.2) * 0.75;
    u.uT.value += dt;
    if (shaftT <= 0) shaftMesh.visible = false;
  }
  for (let i = 0; i < N; i++) {
    const p = P[i]; if (p.life <= 0) continue;
    p.life -= dt; any = true;
    if (p.life <= 0) { mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vx *= 1 - dt * 1.2; p.vz *= 1 - dt * 1.2;
    p.rx += p.spin * dt;
    const t = p.life / p.max; const s = p.s * Math.min(1, t * 3) * (0.6 + 0.4 * t);
    _e.set(p.rx, p.ry, 0); _q.setFromEuler(_e);
    _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(s, s, s)); mesh.setMatrixAt(i, _m);
  }
  if (any) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
}
