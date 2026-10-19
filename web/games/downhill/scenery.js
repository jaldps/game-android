// Course dressing: forests / cacti / houses, grass, rocks, tape lines, flags, wooden kickers, bridges, stairs, roots,
// start / checkpoint / finish arches, spectators. Instanced or merged per 100 m chunk to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries as mergeRaw } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry, clamp, smoothstep } from './rng.js';
import { nearest, trackY, lerpArr } from './track.js';
import { heightAt, addOccluder, U } from './terrain.js';
import { woodTexture, tapeTexture, bannerTexture, houseTexture, domeTexture, barkTexture, rockTexture, flagTexture } from './textures.js';
import { windMaterial } from './foliage.js';

const mergeGeometries = arr => mergeRaw(arr.map(g => g.index ? g.toNonIndexed() : g));
const CH = 100;
const _q = { i: 0, s: 0, u: 0, d: 0 };
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _qq = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export function planScenery(T, bio, biomeId, seed) {
  const R = mulberry(seed * 31 + 5), rr = (a, b) => a + (b - a) * R();
  const P = { trees: [], grass: [], rocks: [], bushes: [], cypress: [], boug: [], houses: [], pines: [], obstacles: [] };
  const nCh = Math.ceil(T.N / CH);
  const at = (s, u, minD, maxSdiff = 25) => {
    const i = clamp(Math.round(s), 0, T.N - 1); const th = T.TH[i];
    const x = T.X[i] - Math.cos(th) * u, z = T.Z[i] + Math.sin(th) * u;
    if (!nearest(T, x, z, 200, _q)) return null;
    if (Math.abs(_q.s - s) > maxSdiff && _q.d < 30) return null; // belongs to another section
    const tw = T.W[Math.round(_q.s)] * 0.5;
    if (_q.d < tw + minD) return null;
    return { x, z, y: heightAt(x, z), s: _q.s, u: _q.u, d: _q.d, tw, ch: Math.min(nCh - 1, Math.floor(_q.s / CH)) };
  };
  const clearZone = s => s < 20 || s > T.N - 30; // start / finish plazas keep their own dressing
  const nearCP = s => T.cps.some(c => Math.abs(c - s) < 10) || Math.abs(T.finish - s) < 30;
  const obst = (p, r, kind) => { if (p.d < p.tw + 8) P.obstacles.push({ s: p.s, u: p.u, r, kind }); };
  const tw0 = bio.width * 0.5;

  // ---- trees / cacti ----
  const treeStep = biomeId === 'desert' ? 6 : biomeId === 'village' ? 4.5 : 2.0;
  const bands = biomeId === 'desert' ? [[3, 10, 0.18], [10, 40, 0.3], [40, 90, 0.2]] :
    biomeId === 'village' ? [[9, 22, 0.25], [22, 60, 0.35]] :
    [[2.2, 7, 0.5], [7, 20, 0.62], [20, 45, 0.7], [45, 85, 0.5]];
  for (let s = 0; s < T.N; s += treeStep) for (const side of [-1, 1]) for (const [a, b, pr] of bands) {
    if (R() > pr) continue;
    if (clearZone(s) && a < 6) continue;
    const u = side * (tw0 + rr(a, b));
    const p = at(s + rr(-1, 1), u, a - 0.3); if (!p) continue;
    const v = Math.floor(R() * 3); const sc = rr(0.75, 1.25) * (a < 6 ? 0.9 : 1);
    p.v = v; p.sc = sc; p.rot = R() * 6.283; p.tint = R();
    if (biomeId === 'autumn' && R() < 0.18) { P.pines.push(p); addOccluder(p.x, p.z, 2.4 * sc, 0.4); obst(p, 0.4, 'tree'); continue; }
    if (biomeId === 'village' && R() < 0.45) { P.cypress.push(p); addOccluder(p.x, p.z, 1.2 * sc, 0.3); obst(p, 0.35, 'tree'); continue; }
    P.trees.push(p);
    addOccluder(p.x, p.z, (biomeId === 'desert' ? 1.0 : biomeId === 'village' ? 2.0 : 2.6) * sc, biomeId === 'desert' ? 0.25 : 0.45);
    obst(p, biomeId === 'desert' ? 0.45 : 0.42, biomeId === 'desert' ? 'cactus' : 'tree');
  }
  // ---- houses (village) ----
  if (bio.houses) {
    for (const side of [-1, 1]) for (const row of [0, 1, 2]) {
      let s = 22 + R() * 6;
      while (s < T.N - 40) {
        const w = rr(4, 8.5), dep = rr(4, 7), gap = row === 0 ? rr(0.3, 3.5) : rr(1, 6);
        if (row === 0 && R() < 0.12) { s += rr(6, 14); continue; } // open terrace / alley
        const off = row === 0 ? rr(1.0, 1.8) : row === 1 ? rr(8.5, 11) : rr(16, 21);
        const sc = s + w / 2; const u = side * (tw0 + off + dep / 2);
        const p = at(sc, u, off + dep / 2 - 0.4, 12);
        if (p && !nearCP(sc)) {
          const i = Math.round(sc);
          const hgt = (row === 0 ? rr(3.2, 6.5) : rr(4, 9)) + (row > 0 ? row * 1.5 : 0);
          P.houses.push({ ...p, w, dep, hgt, th: T.TH[i], dome: R() < (row === 0 ? 0.12 : 0.22), side, row, vrow: Math.floor(R() * 2) });
          addOccluder(p.x, p.z, Math.max(w, dep) * 0.6, 0.35);
          if (R() < 0.35) P.boug.push({ ...at(sc, side * (tw0 + off - 0.2), 0) || p, sc: rr(0.8, 1.3), rot: R() * 6 });
        }
        s += w + gap;
      }
    }
  }
  // ---- rocks ----
  const rockStep = biomeId === 'desert' ? 3 : 5;
  for (let s = 8; s < T.N; s += rockStep) for (const side of [-1, 1]) {
    if (R() > (biomeId === 'village' ? 0.15 : 0.55)) continue;
    const near = R() < 0.6; const dd = near ? rr(0.6, 4) : rr(4, 50);
    const p = at(s + rr(-2, 2), side * (tw0 + dd), dd - 0.2); if (!p) continue;
    p.v = Math.floor(R() * 3); p.sc = near ? rr(0.18, 0.5) : rr(0.5, biomeId === 'desert' ? 3.2 : 2.0) * (R() < 0.15 ? 1.8 : 1); p.rot = R() * 6.28; p.sink = 0.25;
    P.rocks.push(p); if (p.sc > 0.7) { addOccluder(p.x, p.z, p.sc * 1.3, 0.35); obst(p, p.sc * 0.85, 'rock'); }
  }
  // rock-garden obstacles on the trail
  for (const f of T.feats) if (f.type === 'rocks') for (const r of f.rocks) {
    const i = Math.round(r.s), th = T.TH[i]; const x = T.X[i] - Math.cos(th) * r.u, z = T.Z[i] + Math.sin(th) * r.u;
    const p = { x, z, y: heightAt(x, z), s: r.s, u: r.u, v: Math.floor(R() * 3), sc: r.r, rot: R() * 6, sink: 0.3, ch: Math.floor(r.s / CH) };
    P.rocks.push(p); P.obstacles.push({ s: r.s, u: r.u, r: r.r * 0.9, kind: 'rock' });
    for (let k = 0; k < 4; k++) { const q = at(r.s + rr(-3, 3), rr(-tw0 + 0.3, tw0 - 0.3), -tw0 - 1); if (q) { q.v = k % 3; q.sc = rr(0.08, 0.16); q.rot = R() * 6; q.sink = 0.3; P.rocks.push(q); } }
  }
  // ---- grass tufts / bushes ----
  const gStep = biomeId === 'desert' ? 1.4 : 0.42;
  for (let s = 2; s < T.N; s += gStep) for (const side of [-1, 1]) {
    if (R() > 0.85) continue;
    const dd = -0.35 + Math.pow(R(), 1.8) * (biomeId === 'village' ? 3 : 11);
    if (bio.houses && dd > 0.2 && dd < 1) continue;
    const p = at(s + rr(-0.3, 0.3), side * (tw0 + dd), dd - 0.05); if (!p) continue;
    p.sc = rr(0.6, 1.25) * (dd < 0.5 ? 0.75 : 1); p.rot = R() * 6.28; P.grass.push(p);
  }
  for (let s = 6; s < T.N; s += 7) for (const side of [-1, 1]) {
    if (R() > 0.5) continue;
    const dd = rr(1.2, 14); const p = at(s + rr(-3, 3), side * (tw0 + dd), dd - 0.2); if (!p) continue;
    p.sc = rr(0.7, 1.5); p.rot = R() * 6.28; p.tint = R(); P.bushes.push(p);
  }
  // per-chunk bucketing
  for (const k of ['trees', 'grass', 'rocks', 'bushes', 'cypress', 'boug', 'houses', 'pines']) P[k].forEach(p => { if (p.ch === undefined) p.ch = Math.min(nCh - 1, Math.max(0, Math.floor(p.s / CH))); });
  P.obstacles.sort((a, b) => a.s - b.s);
  return P;
}

// ------------------------------------------------------------------ instancing helpers
function inst(scene, geo, mat, items, mk, opts = {}) {
  if (!items.length || !geo) return null;
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((p, k) => { mk(p, _m); m.setMatrixAt(k, _m); if (opts.color) { opts.color(p, _c); m.setColorAt(k, _c); } });
  m.castShadow = opts.shadow !== false; m.receiveShadow = opts.receive !== false;
  m.computeBoundingSphere(); m.matrixAutoUpdate = false;
  scene.add(m); return m;
}
const place = (p, sc, rot, sink = 0, m = _m) => { _p.set(p.x, p.y - sink, p.z); _qq.setFromEuler(_e.set(0, rot, 0)); _s.set(sc, sc, sc); return m.compose(_p, _qq, _s); };

export function buildScenery(scene, T, bio, biomeId, S, P, seed) {
  const R = mulberry(seed * 7 + 3), rr = (a, b) => a + (b - a) * R();
  const nCh = Math.ceil(T.N / CH); const out = { meshes: [], spectators: [], arches: [] };
  const by = (arr, c) => arr.filter(p => p.ch === c);
  const tintAutumn = ['#e8741e', '#d0401a', '#f0b02a', '#c25a1c', '#e8962a', '#b8b03a', '#f2c84a'];
  for (let c = 0; c < nCh; c++) {
    const trees = by(P.trees, c);
    for (let v = 0; v < S.trees.length; v++) {
      const list = trees.filter(p => p.v % S.trees.length === v); const tg = S.trees[v];
      const tm = biomeId === 'desert' ? S.cactusMat : S.trunkMat;
      if (biomeId === 'autumn') {
        const birch = list.filter(p => p.tint < 0.3), oak = list.filter(p => p.tint >= 0.3);
        out.meshes.push(inst(scene, tg.trunk, S.birchMat, birch, p => place(p, p.sc, p.rot, 0.2)));
        out.meshes.push(inst(scene, tg.trunk, tm, oak, p => place(p, p.sc, p.rot, 0.2)));
      } else out.meshes.push(inst(scene, tg.trunk, tm, list, p => place(p, p.sc, p.rot, 0.15)));
      if (tg.cards) out.meshes.push(inst(scene, tg.cards, S.cardMat, list, p => place(p, p.sc, p.rot, 0.15), {
        color: biomeId === 'autumn' ? (p, col) => col.set(tintAutumn[Math.floor(p.tint * 97) % tintAutumn.length]) : (p, col) => col.setScalar(0.85 + p.tint * 0.3),
      }));
    }
    if (S.pines) { const l = by(P.pines, c); out.meshes.push(inst(scene, S.pines[0].trunk, S.trunkMat, l, p => place(p, p.sc, p.rot, 0.15)), inst(scene, S.pines[0].cards, S.pineCard, l, p => place(p, p.sc, p.rot, 0.15))); }
    if (S.cypress) for (let v = 0; v < 2; v++) { const l = by(P.cypress, c).filter(p => p.v % 2 === v); out.meshes.push(inst(scene, S.cypress[v].trunk, S.trunkMat, l, p => place(p, p.sc, p.rot, 0.1)), inst(scene, S.cypress[v].cards, S.cypMat, l, p => place(p, p.sc, p.rot, 0.1))); }
    if (S.bougMat) out.meshes.push(inst(scene, S.bush.cards, S.bougMat, by(P.boug, c), p => place(p, p.sc * 1.3, p.rot, 0.1)));
    out.meshes.push(inst(scene, S.bush.cards, S.bushMat, by(P.bushes, c), p => place(p, p.sc, p.rot, 0.1), {
      color: (p, col) => biomeId === 'desert' ? col.set(p.tint > 0.5 ? '#c8c088' : '#a8b080') : biomeId === 'autumn' ? col.set(p.tint > 0.5 ? '#e0a040' : '#b0a040') : col.setScalar(0.8 + p.tint * 0.4) }));
    for (let v = 0; v < 3; v++) out.meshes.push(inst(scene, S.rocks[v], S.rockMat, by(P.rocks, c).filter(p => p.v === v), p => { place(p, 1, p.rot, p.sink * p.sc); _s.set(p.sc * 1.2, p.sc, p.sc); return _m.compose(_p, _qq, _s); }));
    out.meshes.push(inst(scene, S.grass, S.grassMat, by(P.grass, c), p => place(p, p.sc, p.rot, 0.04), { shadow: false, color: (p, col) => col.setScalar(0.8 + (p.rot % 1) * 0.35) }));
  }
  out.meshes = out.meshes.filter(Boolean);
  buildProps(scene, T, bio, biomeId, P, R, out);
  return out;
}

// ------------------------------------------------------------------ props (merged per chunk per material)
function buildProps(scene, T, bio, biomeId, P, R, out) {
  const rr = (a, b) => a + (b - a) * R();
  const mats = {
    wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 }),
    post: new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6, vertexColors: true }),
    tape: new THREE.MeshStandardMaterial({ map: tapeTexture(), roughness: 0.6, side: THREE.DoubleSide }),
    bark: new THREE.MeshStandardMaterial({ map: barkTexture('pine'), roughness: 0.95 }),
    stone: new THREE.MeshStandardMaterial({ map: rockTexture(bio, biomeId), roughness: 0.9, color: biomeId === 'village' ? '#ffffff' : '#dddddd' }),
    plaster: new THREE.MeshStandardMaterial({ map: houseTexture(), roughness: 0.92 }),
    dome: new THREE.MeshStandardMaterial({ map: domeTexture(), roughness: 0.35, metalness: 0.0 }),
    white: new THREE.MeshStandardMaterial({ color: '#f6f3ec', roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ color: '#3a7a8a', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.85 }),
    arch: new THREE.MeshStandardMaterial({ color: '#ff5a1a', roughness: 0.35 }),
    arch2: new THREE.MeshStandardMaterial({ color: '#1f6fe0', roughness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: '#8a8f96', roughness: 0.4, metalness: 0.8 }),
  };
  const nCh = Math.ceil(T.N / CH);
  const G = Array.from({ length: nCh }, () => ({}));
  const add = (s, key, g) => { const c = clamp(Math.floor(s / CH), 0, nCh - 1); (G[c][key] || (G[c][key] = [])).push(g); };
  const fr = (s, u, y = null) => { // world point on track frame
    const i = clamp(Math.floor(s), 0, T.N - 2), f = s - i; const th = T.TH[i] + (T.TH[i + 1] - T.TH[i]) * f;
    const x = T.X[i] + (T.X[i + 1] - T.X[i]) * f - Math.cos(th) * u, z = T.Z[i] + (T.Z[i + 1] - T.Z[i]) * f + Math.sin(th) * u;
    return new THREE.Vector3(x, y ?? (trackY(T, s) + lerpArr(T.BANK, s) * u), z);
  };
  const box = (w, h, d, pos, th, key, s, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.rotateY(th); g.translate(pos.x, pos.y, pos.z); add(s, key, g); return g; };
  const cyl = (r, h, pos, key, s, seg = 6) => { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(pos.x, pos.y + h / 2, pos.z); add(s, key, g); return g; };
  const thAt = s => lerpArr(T.TH, s);

  // ---- tape lines with posts (not in village: there are walls) ----
  const tapeRuns = [];
  if (!bio.houses) {
    let s = 18;
    while (s < T.N - 20) {
      const len = rr(40, 110);
      const curvy = Math.abs(lerpArr(T.K, s + len / 2)) > 1 / 60 || T.feats.some(f => f.s0 > s && f.s0 < s + len && f.type !== 'roots');
      if (curvy || R() < 0.45) tapeRuns.push([s, Math.min(T.N - 20, s + len)]);
      s += len + rr(10, 50);
    }
  } else {
    // low white walls along both edges
    for (let s = 20; s < T.N - 20; s += 2) for (const side of [-1, 1]) {
      const i = Math.round(s); const tw = T.W[i] * 0.5 + 0.25; const a = fr(s, side * tw), b = fr(s + 2, side * tw);
      const ya = heightAt(a.x, a.z), yb = heightAt(b.x, b.z); const mid = a.clone().add(b).multiplyScalar(0.5); mid.y = Math.min(ya, yb) + 0.25;
      const len = a.distanceTo(b) + 0.05; const g = new THREE.BoxGeometry(0.32, 0.95 + Math.abs(ya - yb), len); g.rotateY(Math.atan2(b.x - a.x, b.z - a.z)); g.translate(mid.x, mid.y, mid.z); add(s, 'white', g);
    }
  }
  out.tapeRuns = tapeRuns;
  const flagItems = [];
  for (const [s0, s1] of tapeRuns) for (const side of [-1, 1]) {
    const pts = []; for (let s = s0; s <= s1; s += 3.5) { const i = Math.round(s); const u = side * (T.W[i] * 0.5 + 1.35); const p = fr(s, u); p.y = heightAt(p.x, p.z); pts.push({ p, s }); }
    for (let k = 0; k < pts.length; k++) {
      const { p, s } = pts[k];
      const g = new THREE.CylinderGeometry(0.035, 0.04, 1.1, 5); g.translate(p.x, p.y + 0.5, p.z);
      const n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const yy = g.attributes.position.getY(i) - p.y; const red = Math.floor(yy / 0.25) % 2 === 1; col[i * 3] = 1; col[i * 3 + 1] = red ? 0.35 : 1; col[i * 3 + 2] = red ? 0.15 : 1; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); add(s, 'post', g);
      if (k % 5 === 2) flagItems.push({ p, s, th: thAt(s), side });
      if (k < pts.length - 1) {
        const q = pts[k + 1].p; const segs = 6; const pos = [], uv = [], idx = [];
        for (let j = 0; j <= segs; j++) { const t = j / segs; const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t, y = p.y + (q.y - p.y) * t + 0.92 - Math.sin(t * Math.PI) * 0.09;
          pos.push(x, y + 0.04, z, x, y - 0.04, z); uv.push(t * 3.5, 1, t * 3.5, 0); if (j < segs) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
        const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
        add(s, 'tape', tg);
      }
    }
  }
  // ---- features ----
  for (const f of T.feats) {
    if (f.type === 'kicker') {
      const nz = 8, half = f.half; const pos = [], uv = [], idx = [];
      const top = (q, x) => { const s = f.s0 + q * f.len; const p = fr(s, f.u0 + x); p.y = trackY(T, s) + lerpArr(T.BANK, s) * (f.u0 + x) + f.H * Math.pow(q, 1.45) + 0.03; return p; };
      for (let j = 0; j <= nz; j++) { const q = j / nz; for (const x of [-half, half]) { const p = top(q, x); pos.push(p.x, p.y, p.z); uv.push(x > 0 ? 1 : 0, q * 4); } }
      for (let j = 0; j < nz; j++) { const a = j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); dg.setIndex(idx); dg.computeVertexNormals();
      add(f.s0, 'wood', dg);
      // side skirts + lip face
      for (const x of [-half, half]) {
        const sp = [], su = [], si = [];
        for (let j = 0; j <= nz; j++) { const q = j / nz; const p = top(q, x); const g0 = p.y - f.H * Math.pow(q, 1.45) - 0.25; sp.push(p.x, p.y, p.z, p.x, g0, p.z); su.push(q, 1, q, 0); if (j < nz) { const a = j * 2; if (x < 0) si.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); sg.setIndex(si); sg.computeVertexNormals(); add(f.s0, 'wood', sg);
      }
      const lp = fr(f.s1, f.u0); lp.y = trackY(T, f.s1) + f.H / 2 - 0.1;
      box(half * 2, f.H + 0.2, 0.08, lp, thAt(f.s1), 'wood', f.s1);
      for (const x of [-half + 0.08, half - 0.08]) { const pp = fr(f.s1 - 0.1, f.u0 + x); pp.y = trackY(T, f.s1) - 0.2; cyl(0.06, f.H + 0.25, pp, 'wood', f.s1, 5); }
    } else if (f.type === 'bridge') {
      const [d0, d1] = f.deck; const g0 = T.GOFF[d0 - 1] || 0, g1 = T.GOFF[Math.min(T.N - 1, d1 + 1)];
      const deckY = s => T.Y[Math.floor(s)] + (T.Y[Math.min(T.N - 1, Math.floor(s) + 1)] - T.Y[Math.floor(s)]) * (s % 1) + g0 + (g1 - g0) * (s - d0) / (d1 - d0);
      for (let s = d0; s < d1; s += 0.32) { const i = Math.round(s); const tw = T.W[i] * 0.5 + 0.35; const p = fr(s, 0); p.y = deckY(s) - 0.04; box(tw * 2, 0.07, 0.27, p, thAt(s), 'wood', s); }
      for (const side of [-1, 1]) {
        for (let s = d0; s <= d1; s += 2.2) {
          const i = Math.round(s); const u = side * (T.W[i] * 0.5 + 0.3); const p = fr(s, u); const y = deckY(s);
          const ground = heightAt(p.x, p.z); p.y = ground - 0.3; cyl(0.11, y - ground + 1.35, p, 'wood', s, 6);
        }
        // stringer + rail
        for (let s = d0; s < d1; s += 2) {
          const i = Math.round(s); const u = side * (T.W[i] * 0.5 + 0.3); const a = fr(s, u), b = fr(Math.min(d1, s + 2), u);
          a.y = deckY(s); b.y = deckY(Math.min(d1, s + 2)); const m = a.clone().add(b).multiplyScalar(0.5); const len = a.distanceTo(b);
          const th = Math.atan2(b.x - a.x, b.z - a.z), pitch = -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
          for (const [hy, sz] of [[-0.2, [0.16, 0.3]], [1.0, [0.1, 0.12]], [0.55, [0.06, 0.08]]]) {
            const g = new THREE.BoxGeometry(sz[0], sz[1], len + 0.05); g.rotateX(pitch); g.rotateY(th); g.translate(m.x, m.y + hy, m.z); add(s, 'wood', g);
          }
        }
      }
      // creek water across the dip
      const sm = (d0 + d1) / 2; const p = fr(sm, 0); const bottom = heightAt(p.x, p.z);
      const wg = new THREE.PlaneGeometry(Math.max(6, (d1 - d0) * 0.55), 70); wg.rotateX(-Math.PI / 2); wg.rotateY(thAt(sm)); wg.translate(p.x, bottom + 0.35, p.z); add(sm, 'water', wg);
      // stones along creek
    } else if (f.type === 'stairs') {
      const n = f.steps; const L = f.s1 - f.s0;
      for (let k = 0; k < n; k++) {
        const s = f.s0 + (k + 0.5) * L / n; const i = Math.round(s); const tw = T.W[i] * 0.5;
        const yTop = T.Y[Math.floor(f.s0)] + (T.Y[Math.floor(f.s1)] - T.Y[Math.floor(f.s0)]) * (k + 0.5) / n + (T.GOFF[Math.floor(f.s0)] - f.D * (k / n)) ;
        const p = fr(s, 0); p.y = yTop - 0.35; box(tw * 2 + 0.2, 0.7, L / n + 0.02, p, thAt(s), 'stone', s);
        const ed = fr(s, 0); ed.y = yTop + 0.005; box(tw * 2 + 0.2, 0.02, 0.06, fr(s - L / n / 2 + 0.03, 0, yTop + 0.01), thAt(s), 'white', s);
      }
    } else if (f.type === 'roots') {
      for (const b of f.bars) {
        const i = Math.round(b.s); const tw = T.W[i] * 0.5 + 0.8; const pts = [];
        for (let k = 0; k <= 8; k++) { const u = -tw + 2 * tw * k / 8; const s = b.s + u * Math.tan(b.a) * 0.4; const p = fr(s, u); p.y = heightAt(p.x, p.z) + 0.02 + Math.sin(k * 1.7 + b.s) * 0.03; pts.push(p); }
        const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.06 + R() * 0.05, 5); add(b.s, 'bark', g);
      }
    } else if (f.type === 'table' || f.type === 'gap' || f.type === 'drop') {
      // timber lip edging on jump faces
      const s = f.lip; const i = Math.round(s); const tw = T.W[i] * 0.5;
      const p = fr(s - 0.15, 0); p.y = trackY(T, s - 0.15) - 0.05; box(tw * 1.6, 0.14, 0.18, p, thAt(s), 'wood', s);
    }
  }
  // ---- arches: start, checkpoints, finish ----
  const arch = (s, text, key, bannerBg) => {
    const i = Math.round(s); const tw = T.W[i] * 0.5 + 1.0; const th = thAt(s);
    const pts = []; for (let k = 0; k <= 16; k++) { const a = Math.PI * k / 16; const p = fr(s, -Math.cos(a) * tw); p.y = trackY(T, s) + Math.sin(a) * 4.4 - 0.2; pts.push(p); }
    add(s, key, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.42, 10));
    const c = fr(s, 0); c.y = trackY(T, s) + 3.55;
    const bm = new THREE.MeshStandardMaterial({ map: bannerTexture(text, bannerBg, '#ffffff', 512, 96), roughness: 0.6, side: THREE.DoubleSide });
    const bg = new THREE.PlaneGeometry(tw * 1.3, 0.85); bg.rotateY(th + Math.PI); bg.translate(c.x, c.y, c.z);
    const bmesh = new THREE.Mesh(bg, bm); bmesh.castShadow = true; scene.add(bmesh); out.meshes.push(bmesh);
    out.arches.push({ s, text });
  };
  arch(T.start + 2, 'START', 'arch', '#1f6fe0');
  T.cps.forEach((s, k) => arch(s, 'CHECKPOINT ' + (k + 1), k % 2 ? 'arch' : 'arch2', k % 2 ? '#ff5a1a' : '#1f6fe0'));
  arch(T.finish, 'FINISH', 'arch', '#e8203a');
  // start platform (wooden deck behind the grid) + finish fence banners
  for (let s = 2; s < T.start - 1; s += 0.4) { const i = Math.round(s); const p = fr(s, 0); p.y = trackY(T, s) - 0.02; box(T.W[i] + 0.6, 0.08, 0.36, p, thAt(s), 'wood', s); }
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTexture('RIDGELINE', '#14213a', '#ffd21a', 1024, 128), roughness: 0.7, side: THREE.DoubleSide });
  const banners = [];
  const fence = (s0, s1, side) => {
    for (let s = s0; s < s1; s += 3) {
      const i = Math.round(s); const u = side * (T.W[i] * 0.5 + 1.7); const a = fr(s, u), b = fr(s + 3, u); a.y = heightAt(a.x, a.z); b.y = heightAt(b.x, b.z);
      const m = a.clone().add(b).multiplyScalar(0.5); const g = new THREE.PlaneGeometry(a.distanceTo(b), 0.8); g.rotateY(Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2); g.translate(m.x, m.y + 0.62, m.z); banners.push(g);
      const pp = a.clone(); pp.y -= 0.1; cyl(0.04, 1.15, pp, 'metal', s, 5);
    }
  };
  for (const side of [-1, 1]) { fence(T.finish - 50, T.finish + 12, side); fence(4, T.start + 14, side); T.cps.forEach(c => fence(c - 12, c + 6, side)); }
  if (banners.length) { const bm = new THREE.Mesh(mergeGeometries(banners), bannerMat); bm.receiveShadow = true; scene.add(bm); out.meshes.push(bm); }

  // ---- houses (village) ----
  for (const h of P.houses) {
    const th = h.th; const base = h.y - 2.2; const H = h.hgt + 2.2;
    const g = new THREE.BoxGeometry(h.w, H, h.dep);
    // world-scaled uvs: 1 tile = 3 m; pick facade row variant
    const uv = g.attributes.uv, pos = g.attributes.position, nor = g.attributes.normal;
    for (let k = 0; k < uv.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k), ny = Math.abs(nor.getY(k));
      if (ny > 0.5) uv.setXY(k, 0.02, 0.98); // plain roof plaster
      else { const horiz = Math.abs(nor.getX(k)) > 0.5 ? z : x; uv.setXY(k, (horiz + 50) / 3 * 0.5, ((y + H / 2 - 2.2) / 3) * 0.5 + h.vrow * 0.5); }
    }
    g.rotateY(th); g.translate(h.x, base + H / 2, h.z); add(h.s, 'plaster', g);
    // parapet
    const pg = new THREE.BoxGeometry(h.w + 0.2, 0.3, h.dep + 0.2); pg.rotateY(th); pg.translate(h.x, base + H + 0.15, h.z); add(h.s, 'white', pg);
    if (h.dome) { const dg = new THREE.SphereGeometry(Math.min(h.w, h.dep) * 0.36, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); dg.translate(h.x, base + H + 0.3, h.z); add(h.s, 'dome', dg);
      const cg = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 4); cg.translate(h.x, base + H + 0.3 + Math.min(h.w, h.dep) * 0.36 + 0.4, h.z); add(h.s, 'white', cg); }
    else if (R() < 0.4) { const cg = new THREE.BoxGeometry(0.6, 1.0, 0.6); cg.translate(h.x + rr(-1, 1), base + H + 0.5, h.z + rr(-1, 1)); add(h.s, 'white', cg); }
  }
  // merge
  for (let c = 0; c < nCh; c++) for (const key in G[c]) {
    const geo = mergeGeometries(G[c][key].map(g => { for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a); if (key !== 'post' && g.attributes.color) g.deleteAttribute('color'); return g; }));
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mats[key]); m.castShadow = key !== 'water' && key !== 'tape'; m.receiveShadow = true; m.matrixAutoUpdate = false;
    scene.add(m); out.meshes.push(m);
  }
  // flags
  if (flagItems.length) {
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.55, 0.18, 0, 0, 0.36, 0], 3)); fg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0.5, 0, 1], 2));
    const fm = windMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.7 }, { sway: 0.25, flutter: 0.06, card: true, fade: 0, key: 'flag' });
    const cols = ['#ff5a1a', '#1f6fe0', '#ffd21a'];
    out.meshes.push(inst(scene, fg, fm, flagItems, p => { _p.set(p.p.x, p.p.y + 0.75, p.p.z); _qq.setFromEuler(_e.set(0, p.th + (p.side > 0 ? Math.PI : 0) + 0.3, 0)); _s.set(1, 1, 1); return _m.compose(_p, _qq, _s); }, { color: (p, col) => col.set(cols[Math.round(p.s) % 3]) }));
  }
  buildSpectators(scene, T, bio, R, out);
}

// ------------------------------------------------------------------ spectators (instanced, animated in shader)
function spectatorGeometry() {
  const parts = [];
  const add = (g, shirt, arm, col) => { const n = g.attributes.position.count; g.setAttribute('aShirt', new THREE.BufferAttribute(new Float32Array(n).fill(shirt), 1)); g.setAttribute('aArm', new THREE.BufferAttribute(new Float32Array(n).fill(arm), 1)); const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'aShirt', 'aArm', 'color'].includes(a)) g.deleteAttribute(a); parts.push(g.index ? g.toNonIndexed() : g); };
  const pants = [0.18, 0.2, 0.28], skin = [0.86, 0.62, 0.48];
  for (const x of [-0.11, 0.11]) { const l = new THREE.CapsuleGeometry(0.08, 0.6, 3, 6); l.translate(x, 0.42, 0); add(l, 0, 0, pants); }
  const t = new THREE.CapsuleGeometry(0.2, 0.42, 4, 8); t.scale(1, 1, 0.7); t.translate(0, 1.05, 0); add(t, 1, 0, [1, 1, 1]);
  const h = new THREE.SphereGeometry(0.13, 10, 8); h.translate(0, 1.55, 0); add(h, 0, 0, skin);
  const cap = new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, 1.3); cap.translate(0, 1.58, 0); add(cap, 1, 0, [0.95, 0.95, 0.95]);
  for (const x of [-1, 1]) { const a = new THREE.CapsuleGeometry(0.06, 0.5, 3, 6); a.translate(0, 0.3, 0); a.rotateZ(-x * 0.35); a.translate(x * 0.24, 1.25, 0); add(a, 1, x, [1, 1, 1]); const hd = new THREE.SphereGeometry(0.06, 6, 5); hd.translate(x * 0.24 + x * 0.17, 1.72, 0); add(hd, 0, x, skin); }
  return mergeRaw(parts);
}
function buildSpectators(scene, T, bio, R, out) {
  const rr = (a, b) => a + (b - a) * R();
  const items = [];
  const crowd = (s0, s1, n) => { for (let k = 0; k < n; k++) { const s = rr(s0, s1); const i = Math.round(Math.min(T.N - 1, s)); const side = R() < 0.5 ? -1 : 1; const u = side * (T.W[i] * 0.5 + rr(2.1, 4.5)); const th = T.TH[i]; const x = T.X[i] - Math.cos(th) * u, z = T.Z[i] + Math.sin(th) * u; items.push({ x, z, y: heightAt(x, z), face: th + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + rr(-0.5, 0.5) + Math.PI, s }); } };
  crowd(T.finish - 50, T.finish + 10, 40); crowd(2, T.start + 16, 18);
  T.cps.forEach(c => crowd(c - 12, c + 6, 14));
  for (const f of T.feats) if (['table', 'gap', 'drop', 'kicker', 'bridge'].includes(f.type) && R() < 0.75) crowd(f.s0 - 4, f.s1 + 6, 7);
  const geo = spectatorGeometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aShirt; attribute float aArm;')
      .replace('#include <color_vertex>', `vColor = vec4(color, 1.0);
        #ifdef USE_INSTANCING_COLOR
          vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, aShirt);
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float ph = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.28;
        float cheer = 0.5 + 0.5 * sin(uTime * 0.7 + ph);
        float bob = abs(sin(uTime * 6.5 + ph)) * 0.13 * cheer;
        transformed.y += bob;
        if (abs(aArm) > 0.5) { float sw = sin(uTime * 9.0 + ph) * 0.35 * cheer; transformed.x += aArm * sw * max(0.0, transformed.y - 1.3); }`);
  };
  mat.customProgramCacheKey = () => 'spectator';
  const nCh = Math.ceil(T.N / CH); const shirts = ['#e8203a', '#1f6fe0', '#ffd21a', '#20c4b0', '#ff7a1a', '#7b3cff', '#f2f2f2', '#2a2d33', '#9be81e', '#ff5fb0'];
  for (let c = 0; c < nCh; c++) {
    const list = items.filter(p => Math.floor(p.s / CH) === c); if (!list.length) continue;
    out.meshes.push(inst(scene, geo, mat, list, p => { _p.set(p.x, p.y - 0.05, p.z); _qq.setFromEuler(_e.set(0, p.face, 0)); const k = 0.9 + (p.x % 0.2); _s.set(k, k, k); return _m.compose(_p, _qq, _s); }, { color: (p, col) => col.set(shirts[Math.floor(Math.abs(p.x * 13 + p.z * 7)) % shirts.length]) }));
  }
}
