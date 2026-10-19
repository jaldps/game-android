// Procedural bike + rider as two rigidly-skinned meshes (one draw call per material) posed every frame:
// spinning spoked wheels, steering fork, rotating cranks, 2-bone IK legs to the pedals and arms to the grips,
// crouch / lean / pump / tricks, and a tumbling ragdoll-ish crash pose.
import * as THREE from 'three';
import { canvasTex } from './textures.js';

// ------------------------------------------------------------------ rig builder
class RigBuilder {
  constructor() { this.parts = []; }
  add(geo, bone, slot, color, uvFn = null) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    const uv = new Float32Array(n * 2);
    if (uvFn && g.attributes.uv) { for (let i = 0; i < n; i++) { const r = uvFn(g.attributes.uv.getX(i), g.attributes.uv.getY(i)); uv[i * 2] = r[0]; uv[i * 2 + 1] = r[1]; } }
    else for (let i = 0; i < n; i++) { uv[i * 2] = 0.03; uv[i * 2 + 1] = 0.03; }
    const c = new THREE.Color(color); const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
    this.parts.push({ slot, pos: g.attributes.position.array, nor: g.attributes.normal.array, uv, col, si, sw, n });
  }
  build(materials, nBones) {
    this.parts.sort((a, b) => a.slot - b.slot);
    const N = this.parts.reduce((a, p) => a + p.n, 0);
    const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2), col = new Float32Array(N * 3), si = new Uint16Array(N * 4), sw = new Float32Array(N * 4);
    const g = new THREE.BufferGeometry(); let o = 0, gs = 0, cur = -1;
    for (const p of this.parts) {
      if (p.slot !== cur) { if (cur >= 0) g.addGroup(gs, o - gs, cur); cur = p.slot; gs = o; }
      pos.set(p.pos, o * 3); nor.set(p.nor, o * 3); uv.set(p.uv, o * 2); col.set(p.col, o * 3); si.set(p.si, o * 4); sw.set(p.sw, o * 4); o += p.n;
    }
    g.addGroup(gs, o - gs, cur);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    const mesh = new THREE.SkinnedMesh(g, materials);
    const bones = []; for (let i = 0; i < nBones; i++) { const b = new THREE.Bone(); bones.push(b); mesh.add(b); }
    const sk = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
    mesh.bind(sk, new THREE.Matrix4());
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    return { mesh, bones };
  }
}

// ------------------------------------------------------------------ geometry helpers
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _up = V(0, 1, 0);
function tubeBetween(a, b, r0, r1 = r0, seg = 8) {
  const d = b.clone().sub(a); const L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1, false); g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.normalize())); g.translate(a.x, a.y, a.z);
  return g;
}
/** tapered capsule along +Y from 0 to L (rounded ends), via lathe so it has u/v */
function taperCapsule(r0, r1, L, seg = 10, sx = 1, sz = 1) {
  const pts = [];
  for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r0 + 1e-4, Math.sin(a) * r0)); }
  for (let i = 1; i <= 3; i++) { const t = i / 4; pts.push(new THREE.Vector2(r0 + (r1 - r0) * t, L * t)); }
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1 + 1e-4, L + Math.sin(a) * r1)); }
  const g = new THREE.LatheGeometry(pts, seg); g.scale(sx, 1, sz); return g;
}
function lathe(profile, seg = 16) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

// ------------------------------------------------------------------ BIKE
export const BIKE = {
  RA: V(0, 0.36, -0.6), FA: V(0, 0.36, 0.673), BB: V(0, 0.37, -0.06), HT: V(0, 1.03, 0.36), HB: V(0, 0.88, 0.43),
  wheelR: 0.36, crank: 0.165,
};
BIKE.axis = BIKE.HT.clone().sub(BIKE.HB).normalize();
BIKE.grip = [V(-0.36, 1.115, 0.295), V(0.36, 1.115, 0.295)];

function wheelParts(rb, bone, paint, rear) {
  const R = BIKE.wheelR;
  const tire = new THREE.TorusGeometry(R - 0.046, 0.046, 10, 48); tire.rotateY(Math.PI / 2); rb.add(tire, bone, 1, '#1d1d1f');
  // tread knobs
  const knobs = [];
  for (let i = 0; i < 40; i++) for (const side of [-1, 1]) {
    const a = (i + (side > 0 ? 0.5 : 0)) / 40 * Math.PI * 2; const k = new THREE.BoxGeometry(0.022, 0.018, 0.028);
    k.translate(side * 0.022, R - 0.006, 0); k.rotateX(a); knobs.push(k);
  }
  for (const k of knobs) rb.add(k, bone, 1, '#151516');
  const wall = new THREE.TorusGeometry(R - 0.07, 0.022, 6, 40); wall.rotateY(Math.PI / 2); wall.scale(1.25, 1, 1); rb.add(wall, bone, 1, '#6e5a44');
  const rim = new THREE.TorusGeometry(R - 0.085, 0.017, 6, 40); rim.rotateY(Math.PI / 2); rb.add(rim, bone, 0, paint.rim);
  const hub = new THREE.CylinderGeometry(0.032, 0.032, 0.13, 10); hub.rotateZ(Math.PI / 2); rb.add(hub, bone, 2, '#c8ccd2');
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2, side = i % 2 ? 1 : -1;
    const p0 = V(side * 0.045, Math.cos(a + side * 0.25) * 0.03, Math.sin(a + side * 0.25) * 0.03);
    const p1 = V(side * 0.008, Math.cos(a) * (R - 0.095), Math.sin(a) * (R - 0.095));
    rb.add(tubeBetween(p0, p1, 0.0032, 0.0032, 3), bone, 2, '#d9dde2');
  }
  const disc = new THREE.RingGeometry(0.06, 0.1, 24, 1); disc.rotateY(Math.PI / 2); disc.translate(-0.055, 0, 0);
  const disc2 = disc.clone(); disc2.rotateY(Math.PI); disc2.translate(-0.11, 0, 0);
  rb.add(disc, bone, 2, '#b8bcc4'); rb.add(disc2, bone, 2, '#b8bcc4');
  if (rear) for (let k = 0; k < 6; k++) { const c = new THREE.CylinderGeometry(0.075 - k * 0.008, 0.075 - k * 0.008, 0.005, 20); c.rotateZ(Math.PI / 2); c.translate(0.035 + k * 0.007, 0, 0); rb.add(c, bone, 2, '#9aa0a8'); }
}

export function buildBike(paint) {
  const rb = new RigBuilder(); const B = BIKE;
  const F = paint.frame, A = paint.acc;
  // frame (bone 0)
  const tt0 = V(0, 0.985, 0.375), tt1 = V(0, 0.83, -0.2);
  rb.add(tubeBetween(tt0, tt1, 0.031, 0.027), 0, 0, F);
  const dt0 = V(0, 0.92, 0.41), dt1 = V(0, 0.42, -0.03);
  rb.add(tubeBetween(dt0, dt1, 0.044, 0.04, 10), 0, 0, F);
  rb.add(tubeBetween(dt0.clone().lerp(dt1, 0.3), dt0.clone().lerp(dt1, 0.62), 0.0455, 0.0415, 10), 0, 0, A); // accent band
  rb.add(tubeBetween(B.BB, V(0, 0.86, -0.245), 0.032), 0, 0, F);
  rb.add(tubeBetween(B.HB.clone().addScaledVector(B.axis, -0.03), B.HT.clone().addScaledVector(B.axis, 0.02), 0.042, 0.042, 10), 0, 0, F);
  for (const x of [-0.065, 0.065]) {
    rb.add(tubeBetween(V(x * 0.8, 0.38, -0.08), V(x, B.RA.y, B.RA.z), 0.021, 0.016), 0, 0, F);
    rb.add(tubeBetween(V(x * 0.7, 0.74, -0.2), V(x, B.RA.y + 0.02, B.RA.z), 0.017, 0.014), 0, 0, F);
  }
  const bbShell = new THREE.CylinderGeometry(0.03, 0.03, 0.09, 10); bbShell.rotateZ(Math.PI / 2); bbShell.translate(B.BB.x, B.BB.y, B.BB.z); rb.add(bbShell, 0, 1, '#222');
  // rear shock: body + coil
  const s0 = V(0, 0.86, 0.06), s1 = V(0, 0.5, -0.15);
  rb.add(tubeBetween(s0, s1, 0.018), 0, 2, '#222');
  const coil = []; const dir = s1.clone().sub(s0); const L = dir.length(); dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
  for (let i = 0; i <= 60; i++) { const t = i / 60; const a = t * Math.PI * 2 * 7; coil.push(V(Math.cos(a) * 0.032, 0.05 + t * (L - 0.14), Math.sin(a) * 0.032).applyQuaternion(q).add(s0)); }
  rb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 120, 0.006, 4), 0, 0, A);
  // seatpost + saddle
  rb.add(tubeBetween(V(0, 0.84, -0.235), V(0, 0.93, -0.27), 0.016), 0, 2, '#2a2a2a');
  const saddle = new THREE.SphereGeometry(1, 12, 8); saddle.scale(0.072, 0.03, 0.135); saddle.translate(0, 0.955, -0.27); rb.add(saddle, 0, 1, '#1a1a1a');
  // chain (static) + derailleur + chain guide
  rb.add(tubeBetween(V(0.07, B.BB.y + 0.09, B.BB.z), V(0.07, B.RA.y + 0.05, B.RA.z), 0.005, 0.005, 4), 0, 2, '#4a4a4e');
  rb.add(tubeBetween(V(0.07, B.BB.y - 0.09, B.BB.z), V(0.07, B.RA.y - 0.08, B.RA.z + 0.02), 0.005, 0.005, 4), 0, 2, '#4a4a4e');
  const der = new THREE.BoxGeometry(0.02, 0.09, 0.04); der.translate(0.075, B.RA.y - 0.07, B.RA.z + 0.01); rb.add(der, 0, 1, '#2b2b2e');
  // steer bone 1: fork, stem, bars (authored relative to pivot HB)
  const P = B.HB, ax = B.axis;
  const rel = v => v.clone().sub(P);
  const ucrown = B.HT.clone().addScaledVector(ax, 0.03), lcrown = B.HB.clone().addScaledVector(ax, -0.035);
  for (const c of [ucrown, lcrown]) { const g = new THREE.BoxGeometry(0.22, 0.035, 0.06); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, ax)); const r = rel(c); g.translate(r.x, r.y, r.z); rb.add(g, 1, 1, '#1d1d1f'); }
  const FAr = rel(B.FA);
  for (const x of [-0.085, 0.085]) {
    const top = rel(ucrown).add(V(x, 0, 0)), mid = FAr.clone().add(V(x, 0, 0)).addScaledVector(ax, 0.3), bot = FAr.clone().add(V(x, 0, 0)).addScaledVector(ax, 0.02);
    rb.add(tubeBetween(top, mid.clone().addScaledVector(ax, -0.02), 0.019), 1, 2, '#e8c24a');
    rb.add(tubeBetween(mid, bot, 0.026, 0.024), 1, 0, paint.fork);
  }
  const arch = new THREE.TorusGeometry(0.085, 0.016, 6, 12, Math.PI); arch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(0, -ax.z, ax.y))); const archP = FAr.clone().addScaledVector(ax, 0.28); arch.translate(archP.x, archP.y, archP.z); rb.add(arch, 1, 0, paint.fork);
  const stemTop = rel(B.HT.clone().addScaledVector(ax, 0.06));
  rb.add(tubeBetween(rel(B.HT), stemTop, 0.02), 1, 1, '#1d1d1f');
  const stem = new THREE.BoxGeometry(0.045, 0.035, 0.06); stem.translate(stemTop.x, stemTop.y + 0.005, stemTop.z - 0.02); rb.add(stem, 1, 1, '#1d1d1f');
  const barPts = [V(-0.39, 1.118, 0.29), V(-0.2, 1.1, 0.31), V(0, 1.092, 0.322), V(0.2, 1.1, 0.31), V(0.39, 1.118, 0.29)].map(rel);
  rb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(barPts), 20, 0.012, 6), 1, 1, '#202022');
  for (const s of [-1, 1]) {
    const gp = rel(V(s * 0.33, 1.114, 0.296)), ge = rel(V(s * 0.405, 1.12, 0.288));
    rb.add(tubeBetween(gp, ge, 0.018), 1, 1, A === '#ffffff' ? '#222' : A);
    const lever = new THREE.BoxGeometry(0.1, 0.008, 0.02); lever.rotateY(s * 0.3); const lp = rel(V(s * 0.28, 1.1, 0.32)); lever.translate(lp.x, lp.y, lp.z + 0.02); rb.add(lever, 1, 2, '#b0b4ba');
  }
  // wheels (bones 2 front, 3 rear)
  wheelParts(rb, 2, paint, false); wheelParts(rb, 3, paint, true);
  // crank (bone 4): chainring + arms
  const ring = new THREE.TorusGeometry(0.09, 0.006, 4, 32); ring.rotateY(Math.PI / 2); ring.translate(0.07, 0, 0); rb.add(ring, 4, 2, '#3a3a3e');
  const ringD = new THREE.CylinderGeometry(0.088, 0.088, 0.004, 24); ringD.rotateZ(Math.PI / 2); ringD.translate(0.068, 0, 0); rb.add(ringD, 4, 1, '#222');
  for (const s of [-1, 1]) { const arm = new THREE.BoxGeometry(0.018, 0.03, B.crank + 0.03); arm.translate(s * 0.085, 0, s * B.crank / 2); rb.add(arm, 4, 1, '#26262a'); }
  // pedals (bones 5,6)
  for (const b of [5, 6]) { const pd = new THREE.BoxGeometry(0.1, 0.02, 0.1); pd.translate(b === 5 ? -0.06 : 0.06, 0, 0); rb.add(pd, b, 1, '#1a1a1c'); const ax2 = new THREE.CylinderGeometry(0.007, 0.007, 0.06, 5); ax2.rotateZ(Math.PI / 2); ax2.translate(b === 5 ? -0.02 : 0.02, 0, 0); rb.add(ax2, b, 2, '#aaa'); }

  const mats = [
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.25, envMapIntensity: 1.2 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.3 }),
  ];
  const { mesh, bones } = rb.build(mats, 7);
  return { mesh, bones, mats };
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _v = new THREE.Vector3(), _xAxis = V(1, 0, 0);
export function poseBike(bike, steer, spinF, spinR, crankA) {
  const b = bike.bones, B = BIKE;
  _qa.setFromAxisAngle(B.axis, steer);
  b[1].position.copy(B.HB); b[1].quaternion.copy(_qa);
  _v.copy(B.FA).sub(B.HB).applyQuaternion(_qa).add(B.HB); b[2].position.copy(_v);
  _qb.setFromAxisAngle(_xAxis, spinF); b[2].quaternion.copy(_qa).multiply(_qb);
  b[3].position.copy(B.RA); b[3].quaternion.setFromAxisAngle(_xAxis, spinR);
  b[4].position.copy(B.BB); b[4].quaternion.setFromAxisAngle(_xAxis, crankA);
  for (const [k, s] of [[5, -1], [6, 1]]) {
    const a = crankA + (s > 0 ? 0 : Math.PI);
    b[k].position.set(s * 0.1, B.BB.y - Math.sin(a) * B.crank, B.BB.z + Math.cos(a) * B.crank);
    b[k].quaternion.identity();
  }
}
export function pedalPos(crankA, side, out) { const a = crankA + (side > 0 ? 0 : Math.PI); return out.set(side * 0.13, BIKE.BB.y - Math.sin(a) * BIKE.crank + 0.025, BIKE.BB.z + Math.cos(a) * BIKE.crank); }
export function gripPos(steer, side, out) { _qa.setFromAxisAngle(BIKE.axis, steer); return out.copy(BIKE.grip[side > 0 ? 1 : 0]).sub(BIKE.HB).applyQuaternion(_qa).add(BIKE.HB); }

// ------------------------------------------------------------------ RIDER
export const RL = { thigh: 0.45, shin: 0.44, uarm: 0.3, farm: 0.285, torso: 0.53 };
function riderAtlas(kit) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    // jersey region: top half (v 0.5..1). u = around torso (0.5 = back)
    const J = kit.jersey, A = kit.acc;
    g.fillStyle = J; g.fillRect(0, 0, w, 128);
    // side panels & shoulder yoke
    g.fillStyle = A; g.fillRect(0, 0, w, 22); // yoke (top of torso = top of canvas region)
    for (const x of [0.25, 0.75]) { g.beginPath(); g.moveTo(w * x - 18, 128); g.lineTo(w * x + 18, 128); g.lineTo(w * x + 8, 22); g.lineTo(w * x - 8, 22); g.fill(); }
    // diagonal stripe front
    g.save(); g.globalAlpha = 0.9; g.fillStyle = A; g.beginPath(); g.moveTo(w * 0.85, 128); g.lineTo(w * 0.95, 128); g.lineTo(w * 1.05, 40); g.lineTo(w * 0.95, 40); g.fill();
    g.beginPath(); g.moveTo(-w * 0.15, 128); g.lineTo(-w * 0.05, 128); g.lineTo(w * 0.05, 40); g.lineTo(-w * 0.05, 40); g.fill(); g.restore();
    // back number
    g.font = '64px "Russo One", "Bungee", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = A; g.strokeText(String(kit.num), w * 0.5, 74);
    g.fillStyle = '#ffffff'; g.fillText(String(kit.num), w * 0.5, 74);
    g.font = '15px "Russo One", sans-serif'; g.fillStyle = A === '#ffffff' ? '#ffffff' : '#ffffff'; g.fillText('RIDGELINE', w * 0.5, 34);
    // hem
    g.fillStyle = A; g.fillRect(0, 118, w, 10);
    // helmet region: bottom-right quarter (u 0.5..1, v 0..0.5): stripes
    g.fillStyle = kit.helmet; g.fillRect(128, 128, 128, 128);
    g.fillStyle = kit.hacc; g.fillRect(128, 128 + 52, 128, 24); g.fillRect(128, 128 + 30, 128, 7); g.fillRect(128, 128 + 91, 128, 7);
  }, { repeat: false });
}
export function buildRider(kit) {
  const rb = new RigBuilder();
  const J = kit.jersey, A = kit.acc, Pn = kit.pants, skin = '#e0a582', glove = A === '#ffffff' ? '#202024' : A;
  // pelvis (0): shorts seat
  const hip = new THREE.SphereGeometry(1, 14, 10); hip.scale(0.175, 0.13, 0.15); hip.translate(0, 0.02, -0.01); rb.add(hip, 0, 0, Pn);
  // torso (1): lathe, origin at pelvis centre, +Y to neck base, +Z chest
  const tp = [[0.001, -0.02], [0.15, 0.0], [0.165, 0.08], [0.175, 0.2], [0.195, 0.33], [0.2, 0.42], [0.17, 0.5], [0.08, 0.545], [0.001, 0.55]];
  const torso = lathe(tp, 20); torso.scale(1, 1, 0.72);
  rb.add(torso, 1, 0, '#ffffff', (u, v) => [u, 0.5 + 0.5 * (1 - v) * 0 + 0.5 * v]);
  // backpack / hydration pack? -> protector hump
  const neck = new THREE.CylinderGeometry(0.055, 0.06, 0.08, 10); neck.translate(0, 0.55, 0.01); rb.add(neck, 1, 0, skin);
  // head (2): origin at neck base, +Y up, +Z forward
  const shell = new THREE.SphereGeometry(0.168, 22, 16); shell.rotateZ(Math.PI / 2); shell.scale(1, 1.02, 1.14); shell.translate(0, 0.19, -0.005);
  rb.add(shell, 2, 1, '#ffffff', (u, v) => [0.5 + u * 0.5, v * 0.5]);
  const chin = new THREE.TorusGeometry(0.13, 0.04, 8, 18, Math.PI); chin.rotateX(Math.PI / 2); chin.rotateZ(Math.PI); chin.scale(1, 1, 1.15); chin.translate(0, 0.075, 0.045); rb.add(chin, 2, 1, kit.helmet);
  const chinGuard = new THREE.BoxGeometry(0.11, 0.07, 0.03); chinGuard.translate(0, 0.07, 0.185); rb.add(chinGuard, 2, 1, kit.hacc);
  const peak = new THREE.BoxGeometry(0.22, 0.014, 0.12); peak.rotateX(-0.28); peak.translate(0, 0.31, 0.17); rb.add(peak, 2, 1, kit.hacc);
  const gog = new THREE.CylinderGeometry(0.168, 0.168, 0.06, 18, 1, true, -1.15, 2.3); gog.scale(1.02, 1, 1.18); gog.translate(0, 0.19, 0.0); rb.add(gog, 2, 2, '#ff8a2a');
  const gogF = new THREE.CylinderGeometry(0.173, 0.173, 0.075, 18, 1, true, -1.25, 2.5); gogF.scale(1.03, 1, 1.19); gogF.translate(0, 0.19, -0.002); rb.add(gogF, 2, 1, '#151515');
  const strap = new THREE.TorusGeometry(0.168, 0.016, 5, 28, Math.PI * 1.1); strap.rotateX(Math.PI / 2); strap.rotateZ(Math.PI * 1.45 + 0.1); strap.scale(1.03, 1, 1.16); strap.translate(0, 0.2, -0.005); rb.add(strap, 2, 1, kit.hacc);
  const vent = new THREE.BoxGeometry(0.05, 0.02, 0.08); vent.translate(0, 0.36, -0.02); rb.add(vent, 2, 1, '#222');
  // arms: upper (3/6), fore (4/7), hand (5/8)
  for (const [ub, fb, hb] of [[3, 4, 5], [6, 7, 8]]) {
    rb.add(taperCapsule(0.06, 0.05, RL.uarm, 10), ub, 0, J);
    const elbow = new THREE.SphereGeometry(0.058, 10, 8); elbow.scale(1, 1, 1); elbow.translate(0, 0.0, -0.01); rb.add(elbow, fb, 0, '#2a2a2e');
    rb.add(taperCapsule(0.048, 0.04, RL.farm, 10), fb, 0, J);
    const cuff = new THREE.CylinderGeometry(0.044, 0.044, 0.05, 10); cuff.translate(0, RL.farm - 0.02, 0); rb.add(cuff, fb, 0, A);
    const hand = new THREE.SphereGeometry(1, 10, 8); hand.scale(0.045, 0.06, 0.05); hand.translate(0, 0.045, 0.01); rb.add(hand, hb, 0, glove);
    const fing = new THREE.CapsuleGeometry(0.022, 0.05, 3, 6); fing.rotateX(Math.PI / 2); fing.translate(0, 0.075, 0.035); rb.add(fing, hb, 0, '#1d1d20');
  }
  // legs: thigh (9/12), shin (10/13), foot (11/14)
  for (const [tb, sb, fb] of [[9, 10, 11], [12, 13, 14]]) {
    rb.add(taperCapsule(0.095, 0.072, RL.thigh, 12, 1.05, 1.0), tb, 0, Pn);
    const hem = new THREE.CylinderGeometry(0.085, 0.09, 0.05, 12); hem.translate(0, RL.thigh - 0.04, 0); rb.add(hem, tb, 0, A);
    rb.add(taperCapsule(0.06, 0.042, RL.shin, 10), sb, 0, '#26262b');
    const pad = new THREE.SphereGeometry(1, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6); pad.rotateX(Math.PI / 2); pad.scale(0.075, 0.12, 0.06); pad.translate(0, 0.1, 0.03); rb.add(pad, sb, 0, '#18181a');
    const padLogo = new THREE.BoxGeometry(0.06, 0.05, 0.01); padLogo.translate(0, 0.12, 0.095); rb.add(padLogo, sb, 0, A);
    const shoe = new THREE.BoxGeometry(0.1, 0.075, 0.27); shoe.translate(0, -0.035, 0.06); rb.add(shoe, fb, 0, '#222226');
    const toe = new THREE.SphereGeometry(1, 10, 6); toe.scale(0.05, 0.04, 0.06); toe.translate(0, -0.03, 0.19); rb.add(toe, fb, 0, '#222226');
    const sole = new THREE.BoxGeometry(0.105, 0.02, 0.28); sole.translate(0, -0.075, 0.06); rb.add(sole, fb, 0, '#e8e4dc');
    const stripe = new THREE.BoxGeometry(0.104, 0.02, 0.12); stripe.translate(0, -0.02, 0.08); rb.add(stripe, fb, 0, A);
  }
  const atlas = riderAtlas(kit);
  const mats = [
    new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.78 }),
    new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.22, metalness: 0.15, envMapIntensity: 1.3 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.95, envMapIntensity: 1.6 }),
  ];
  const { mesh, bones } = rb.build(mats, 15);
  return { mesh, bones, mats };
}

// ---- 2-bone IK + bone orientation ----
const _d = V(0, 0, 0), _t = V(0, 0, 0), _pole = V(0, 0, 0), _k = V(0, 0, 0), _x = V(0, 0, 0), _z = V(0, 0, 0), _y = V(0, 0, 0), _mm = new THREE.Matrix4();
/** orient bone so local +Y points from a to b, local +Z toward 'front' hint */
export function aimBone(bone, a, b, front) {
  _y.copy(b).sub(a).normalize();
  _z.copy(front).addScaledVector(_y, -front.dot(_y)); if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1); _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _mm.makeBasis(_x, _y, _z); bone.quaternion.setFromRotationMatrix(_mm); bone.position.copy(a);
}
/** returns joint (knee/elbow) position into out */
export function ik2(a, target, l1, l2, pole, out) {
  _d.copy(target).sub(a); let L = _d.length(); const maxL = (l1 + l2) * 0.999; if (L > maxL) { _d.multiplyScalar(maxL / L); L = maxL; } if (L < 1e-4) L = 1e-4;
  const dn = _t.copy(_d).divideScalar(L);
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L); const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _pole.copy(pole).addScaledVector(dn, -pole.dot(dn)); if (_pole.lengthSq() < 1e-6) _pole.set(0, 0, 1); _pole.normalize();
  return out.copy(a).addScaledVector(dn, x).addScaledVector(_pole, h);
}
