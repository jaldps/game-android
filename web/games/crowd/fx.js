// Pooled particle bursts (one instanced mesh) + expanding ground rings.
import * as THREE from 'three';

const N = 600;
let mesh = null, rings = null; const P = []; const RG = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
let head = 0;
export function initFx(scene) {
  const g = new THREE.TetrahedronGeometry(0.5, 0);
  const m = new THREE.MeshBasicMaterial({ toneMapped: false });
  mesh = new THREE.InstancedMesh(g, m, N); mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < N; i++) { P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, g: 0, rx: 0, ry: 0, spin: 0 }); mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); mesh.setColorAt(i, _c.set(1, 1, 1)); }
  scene.add(mesh);
  // rings
  const rg = new THREE.RingGeometry(0.85, 1, 48); rg.rotateX(-Math.PI / 2);
  for (let k = 0; k < 6; k++) {
    const mm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const r = new THREE.Mesh(rg, mm); r.visible = false; r.renderOrder = 2; scene.add(r); RG.push({ m: r, t: 0, max: 1, r0: 1, r1: 10 });
  }
}
export function resetFx() { for (let i = 0; i < N; i++) { P[i].life = 0; mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); } mesh.instanceMatrix.needsUpdate = true; for (const r of RG) { r.t = r.max; r.m.visible = false; } }
function emit(x, y, z, vx, vy, vz, life, s, color, g = 0) {
  const p = P[head]; const i = head; head = (head + 1) % N;
  p.life = life; p.max = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = s; p.g = g; p.rx = Math.random() * 6; p.ry = Math.random() * 6; p.spin = (Math.random() - 0.5) * 12;
  mesh.setColorAt(i, _c.set(color));
}
export function sparkle(x, y, z, color) {
  for (let k = 0; k < 4; k++) { const a = Math.random() * 6.28; emit(x, y + 1.0, z, Math.cos(a) * 1.6, 3 + Math.random() * 2.5, Math.sin(a) * 1.6, 0.45 + Math.random() * 0.2, 0.13, k % 2 ? color : '#ffffff', -9); }
}
export function confetti(x, y, z, color, n = 80) {
  const cols = [color, '#ffffff', '#ffd23f', '#ff5fbf', '#3fd0ff'];
  for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, sp = 3 + Math.random() * 9; emit(x, y + 1, z, Math.cos(a) * sp, 7 + Math.random() * 9, Math.sin(a) * sp, 1.3 + Math.random() * 0.7, 0.28, cols[k % cols.length], -14); }
}
export function ring(x, y, z, color, r1 = 12, dur = 0.8) {
  const r = RG.find(q => q.t >= q.max) || RG[0];
  r.t = 0; r.max = dur; r.r1 = r1; r.m.position.set(x, y + 0.08, z); r.m.material.color.set(color); r.m.visible = true;
}
export function updateFx(dt) {
  let any = false;
  for (let i = 0; i < N; i++) {
    const p = P[i]; if (p.life <= 0) continue;
    p.life -= dt; any = true;
    if (p.life <= 0) { mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
    if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    p.rx += p.spin * dt;
    const t = p.life / p.max; const s = p.s * Math.min(1, t * 4);
    _e.set(p.rx, p.ry, p.rx * 0.5); _q.setFromEuler(_e);
    _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(s, s * 0.35, s)); mesh.setMatrixAt(i, _m);
  }
  if (any) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  for (const r of RG) {
    if (r.t >= r.max) continue; r.t += dt; const u = Math.min(1, r.t / r.max);
    const e = 1 - Math.pow(1 - u, 3); const s = 1 + (r.r1 - 1) * e; r.m.scale.set(s, 1, s); r.m.material.opacity = (1 - u) * 0.85;
    if (u >= 1) r.m.visible = false;
  }
}
