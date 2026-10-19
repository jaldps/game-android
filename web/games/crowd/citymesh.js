// Builds the renderable city from the world layout: ground, curbs, buildings (merged facade mesh), platforms,
// ramps, instanced props, contact-AO texture.
import * as THREE from 'three';
import { GRID } from './config.js';
import { W } from './world.js';
import { U, groundMaterial, facadeMaterial, paintMaterial, GROUND } from './materials.js';
import { prop as propGeo, GB } from './geom.js';
import { rand, range, chance, pick } from './rng.js';

const meshes = [];
export function disposeCity(scene) { for (const m of meshes) { scene.remove(m); m.geometry.dispose(); if (m.material.dispose) m.material.dispose(); } meshes.length = 0; }
function add(scene, m, cast = true, recv = true) { m.castShadow = cast; m.receiveShadow = recv; scene.add(m); meshes.push(m); return m; }

// ---------- merged geometry writer with custom attributes ----------
class MW {
  constructor(attrs) { this.a = { position: [], normal: [], color: [] }; for (const [k] of attrs) this.a[k] = []; this.sizes = Object.fromEntries([['position', 3], ['normal', 3], ['color', 3], ...attrs]); this.idx = []; this.v = 0; }
  quad(P, n, col, extra) {
    for (let k = 0; k < 4; k++) {
      this.a.position.push(...P[k]); this.a.normal.push(...n); this.a.color.push(col.r, col.g, col.b);
      for (const key in extra) { const e = extra[key]; const val = typeof e === 'function' ? e(k, P[k]) : e; this.a[key].push(...val); }
    }
    const v = this.v; this.idx.push(v, v + 1, v + 2, v, v + 2, v + 3); this.v += 4;
  }
  build() {
    const g = new THREE.BufferGeometry();
    for (const k in this.a) g.setAttribute(k, new THREE.Float32BufferAttribute(this.a[k], this.sizes[k]));
    g.setIndex(this.idx); g.computeBoundingSphere(); return g;
  }
}

export function buildCity(scene, P) {
  disposeCity(scene);
  // ---- type texture
  const TN = W.TN; const td = new Uint8Array(TN * TN * 4);
  for (let k = 0; k < TN * TN; k++) { td[k * 4] = W.typeGrid[k]; td[k * 4 + 3] = 255; }
  const tt = new THREE.DataTexture(td, TN, TN, THREE.RGBAFormat); tt.magFilter = THREE.NearestFilter; tt.minFilter = THREE.NearestFilter; tt.needsUpdate = true;
  U.uTypes.value = tt;
  U.uAO.value = aoTexture();
  const gm = groundMaterial();
  // ---- ground plane (roads) — oversized so fog hides the edge
  {
    const S = GROUND.TOTAL + 200; const g = new THREE.PlaneGeometry(S, S); g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count; g.setAttribute('gk', new THREE.Float32BufferAttribute(new Float32Array(n), 1)); g.setAttribute('rtile', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 4));
    add(scene, new THREE.Mesh(g, gm), false, true);
  }
  // ---- block slabs (curbs) + platform tops + ramps (ground material)
  {
    const mw = new MW([['gk', 1], ['rtile', 4]]);
    const C = GRID.CURB;
    const slab = (x0, z0, x1, z1, y0, y1, gk, rt, sides = true) => {
      const top = [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]];
      const rtf = gk ? (k, p) => [p[0] - x0, p[2] - z0, x1 - x0, z1 - z0] : [0, 0, 0, 0];
      mw.quad(top, [0, 1, 0], WHITE, { gk: [gk], rtile: rtf });
      if (!sides) return;
      const sgk = gk === 1 ? 3 : 0;
      mw.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], WHITE, { gk: [sgk], rtile: [0, 0, 0, 0] });
      mw.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], WHITE, { gk: [sgk], rtile: [0, 0, 0, 0] });
      mw.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], WHITE, { gk: [sgk], rtile: [0, 0, 0, 0] });
      mw.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], WHITE, { gk: [sgk], rtile: [0, 0, 0, 0] });
    };
    for (const b of W.blocks) slab(b.x0, b.z0, b.x1, b.z1, 0, C, 0);
    for (const p of W.platforms) slab(p.x0, p.z0, p.x1, p.z1, C, p.h, 1, null, false);
    // ramps: sloped top
    for (const r of W.ramps) {
      const { x0, z0, x1, z1, h0, h1, dir } = r; const y = (t) => h0 + (h1 - h0) * t;
      let pts, rt;
      // corners in order (x0,z1),(x1,z1),(x1,z0),(x0,z0) with heights per dir
      const hz = (x, z) => dir === 'x+' ? y((x - x0) / (x1 - x0)) : dir === 'x-' ? y((x1 - x) / (x1 - x0)) : dir === 'z+' ? y((z - z0) / (z1 - z0)) : y((z1 - z) / (z1 - z0));
      pts = [[x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0]].map(p => [p[0], hz(p[0], p[2]) + 0.02, p[2]]);
      const L = (dir[0] === 'x') ? x1 - x0 : z1 - z0, Wd = (dir[0] === 'x') ? z1 - z0 : x1 - x0;
      rt = (k, p) => { const along = dir === 'x+' ? p[0] - x0 : dir === 'x-' ? x1 - p[0] : dir === 'z+' ? p[2] - z0 : z1 - p[2]; const across = dir[0] === 'x' ? p[2] - z0 : p[0] - x0; return [along, across, L, Wd]; };
      const n = new THREE.Vector3(); const a = new THREE.Vector3(...pts[0]), bq = new THREE.Vector3(...pts[1]), c = new THREE.Vector3(...pts[2]);
      n.subVectors(bq, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      mw.quad(pts, [n.x, n.y, n.z], WHITE, { gk: [2], rtile: rt });
    }
    const m = new THREE.Mesh(mw.build(), gm); add(scene, m, true, true);
  }
  // ---- buildings + platform walls (facade material)
  {
    const mw = new MW([['fac', 4], ['fsz', 4], ['fsty', 4]]);
    const col = new THREE.Color();
    const boxF = (x0, z0, x1, z1, y0, y1, color, style, seed, floorH, colW, roof = true) => {
      const w = x1 - x0, d = z1 - z0, H = y1 - y0;
      const fsz = [w, d, H, floorH], fsty = [style, seed, colW, 0];
      const wall = (P, n, W) => mw.quad(P, n, color, { fac: (k) => [[0, 0], [W, 0], [W, H], [0, H]][k].concat([0, W]), fsz: [W, d, H, floorH], fsty });
      wall([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], w);
      wall([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], w);
      wall([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], d);
      wall([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], d);
      if (roof) mw.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], color, { fac: (k, p) => [p[0] - x0, p[2] - z0, 1, 0], fsz, fsty });
    };
    for (const b of W.buildings) {
      const wallHex = b.style === 1 ? P.office[b.office % P.office.length] : P.walls[b.color % P.walls.length];
      col.set(wallHex);
      const fh = b.style === 1 ? 3.0 : b.style === 2 ? 3.2 : 2.6; const cw = b.style === 1 ? 1.6 : 2.2;
      const y0 = GRID.CURB;
      if (b.setback) {
        const h1 = b.h * 0.65; boxF(b.x0, b.z0, b.x1, b.z1, y0, y0 + h1, col, b.style, b.seed, fh, cw);
        const ix = (b.x1 - b.x0) * 0.16, iz = (b.z1 - b.z0) * 0.16;
        boxF(b.x0 + ix, b.z0 + iz, b.x1 - ix, b.z1 - iz, y0 + h1, y0 + b.h, col, b.style, b.seed + 1, fh, cw);
        b.top = y0 + b.h; b.tx0 = b.x0 + ix; b.tz0 = b.z0 + iz; b.tx1 = b.x1 - ix; b.tz1 = b.z1 - iz;
      } else { boxF(b.x0, b.z0, b.x1, b.z1, y0, y0 + b.h, col, b.style, b.seed, fh, cw); b.top = y0 + b.h; b.tx0 = b.x0; b.tz0 = b.z0; b.tx1 = b.x1; b.tz1 = b.z1; }
    }
    for (const p of W.platforms) {
      col.set(P.walls[p.color % P.walls.length]);
      boxF(p.x0, p.z0, p.x1, p.z1, GRID.CURB, p.h, col, 3, p.seed, 3.6, 4, false);
    }
    const m = new THREE.Mesh(mw.build(), facadeMaterial()); add(scene, m, true, true);
  }
  // ---- paint details: parapets, ramp walls + rails, platform rails
  {
    const b = new GB(); const C = new THREE.Color();
    const hex = c => '#' + c.getHexString();
    for (const bl of W.buildings) {
      const w = bl.tx1 - bl.tx0, d = bl.tz1 - bl.tz0, cx = (bl.tx0 + bl.tx1) / 2, cz = (bl.tz0 + bl.tz1) / 2, y = bl.top;
      C.set(bl.style === 1 ? P.office[bl.office % P.office.length] : P.walls[bl.color % P.walls.length]).lerp(new THREE.Color('#ffffff'), 0.55);
      const t = 0.35, ph = 0.5, c = hex(C);
      b.box(w, ph, t, { p: [cx, y, bl.tz0 + t / 2], c }); b.box(w, ph, t, { p: [cx, y, bl.tz1 - t / 2], c });
      b.box(t, ph, d - 2 * t, { p: [bl.tx0 + t / 2, y, cz], c }); b.box(t, ph, d - 2 * t, { p: [bl.tx1 - t / 2, y, cz], c });
    }
    for (const p of W.platforms) {
      const r = p.ramp; const PH = p.h;
      // ramp side wall (under the slope) on the outer side + rails along both sides of the ramp
      const along = r.dir[0] === 'x'; const L = along ? r.x1 - r.x0 : r.z1 - r.z0;
      const seg = 6;
      for (let k = 0; k < seg; k++) {
        const t0 = k / seg, t1 = (k + 1) / seg, tm = (t0 + t1) / 2;
        const hgt = r.h0 + (r.h1 - r.h0) * tm;
        const pos = r.dir === 'x+' ? r.x0 + tm * L : r.dir === 'x-' ? r.x1 - tm * L : r.dir === 'z+' ? r.z0 + tm * L : r.z1 - tm * L;
        // rails along both long edges (posts)
        for (const side of [0, 1]) {
          const ac = along ? (side ? r.z1 - 0.12 : r.z0 + 0.12) : (side ? r.x1 - 0.12 : r.x0 + 0.12);
          const x = along ? pos : ac, z = along ? ac : pos;
          b.box(0.1, 1.0, 0.1, { p: [x, hgt, z], c: '#f8f9fa' });
        }
      }
      // continuous rail bars as tilted boxes
      for (const side of [0, 1]) {
        const ac = along ? (side ? r.z1 - 0.12 : r.z0 + 0.12) : (side ? r.x1 - 0.12 : r.x0 + 0.12);
        const mid = along ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2; const hm = (r.h0 + r.h1) / 2 + 1.0;
        const ang = Math.atan2(r.h1 - r.h0, L); const len = Math.hypot(L, r.h1 - r.h0);
        const sgn = (r.dir === 'x+' || r.dir === 'z+') ? 1 : -1;
        if (along) b.box(len, 0.08, 0.12, { p: [mid, hm - 0.04, ac], r: [0, 0, sgn * ang], c: '#ffd43b' });
        else b.box(0.12, 0.08, len, { p: [ac, hm - 0.04, mid], r: [-sgn * ang, 0, 0], c: '#ffd43b' });
      }
      // low railing around the platform roof edge (gaps at ramp top)
      const y = PH; const posts = [];
      const edge = (x0, z0, x1, z1) => { const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2.2)); for (let k = 0; k <= n; k++) posts.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n]); };
      edge(p.x0 + 0.15, p.z0 + 0.15, p.x1 - 0.15, p.z0 + 0.15); edge(p.x0 + 0.15, p.z1 - 0.15, p.x1 - 0.15, p.z1 - 0.15);
      edge(p.x0 + 0.15, p.z0 + 0.15, p.x0 + 0.15, p.z1 - 0.15); edge(p.x1 - 0.15, p.z0 + 0.15, p.x1 - 0.15, p.z1 - 0.15);
      for (const [x, z] of posts) { if (x > r.x0 - 0.3 && x < r.x1 + 0.3 && z > r.z0 - 0.3 && z < r.z1 + 0.3) continue; b.box(0.12, 0.9, 0.12, { p: [x, y, z], c: '#ffffff' }); }
    }
    if (b.parts.length) { const m = new THREE.Mesh(b.build(), paintMaterial({ rough: 0.6 })); add(scene, m, true, true); }
  }
  // ---- rooftop clutter on buildings (props list additions)
  const extra = [];
  for (const bl of W.buildings) {
    const w = bl.tx1 - bl.tx0, d = bl.tz1 - bl.tz0; const cx = (bl.tx0 + bl.tx1) / 2, cz = (bl.tz0 + bl.tz1) / 2;
    const n = Math.min(4, Math.floor(w * d / 50));
    for (let k = 0; k < n; k++) extra.push({ type: 'acunit', x: cx + range(-w * 0.3, w * 0.3), z: cz + range(-d * 0.3, d * 0.3), rot: chance(0.5) ? 0 : Math.PI / 2, s: range(0.8, 1.2), y: bl.top });
    if (bl.style !== 1 && chance(0.35) && w > 5) extra.push({ type: 'tank', x: cx + range(-w * 0.2, w * 0.2), z: cz + range(-d * 0.2, d * 0.2), rot: 0, s: 1, y: bl.top });
    if (bl.style === 1 && chance(0.6)) extra.push({ type: 'antenna', x: cx + w * 0.25, z: cz - d * 0.2, rot: 0, s: range(1, 1.8), y: bl.top });
    if (bl.style !== 1 && chance(0.25) && w > 6) extra.push({ type: 'roofhut', x: cx - w * 0.2, z: cz + d * 0.2, rot: 0, s: 0.8, y: bl.top });
  }
  // ---- instanced props
  const all = W.props.concat(extra);
  const byType = new Map();
  for (const p of all) { if (!byType.has(p.type)) byType.set(p.type, []); byType.get(p.type).push(p); }
  const matP = paintMaterial({ rough: 0.65 });
  const matF = paintMaterial({ rough: 0.85, wind: true, aoH: 2.0, aoMin: 0.7, env: 0.4 });
  const matCar = paintMaterial({ rough: 0.3, metal: 0.1, env: 1.2, aoH: 0.7, aoMin: 0.55 });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  for (const [type, list] of byType) {
    const g = propGeo(type, P); if (!g.attributes.position.count) continue;
    const mat = ['tree', 'pine', 'bush', 'streettree', 'hedge', 'planter', 'roofplanter'].includes(type) ? matF : type === 'car' ? matCar : matP;
    const im = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((p, i) => {
      const y = p.y || (W.blocks.length && isOnBlock(p.x, p.z) ? GRID.CURB : 0);
      Q.setFromAxisAngle(Y, p.rot || 0); M.compose(V.set(p.x, y, p.z), Q, S.set(p.s || 1, p.s || 1, p.s || 1)); im.setMatrixAt(i, M);
      im.setColorAt(i, new THREE.Color(p.color || '#ffffff'));
    });
    im.computeBoundingSphere();
    add(scene, im, !['flowers'].includes(type), true);
  }
}
const WHITE = new THREE.Color(1, 1, 1);

function isOnBlock(x, z) {
  const g = (v) => { const l = ((v - GRID.X0) % GRID.PITCH + GRID.PITCH) % GRID.PITCH; return l >= GRID.ROAD; };
  return g(x) && g(z);
}

// contact AO baked from footprints (buildings, platforms, obstacles)
function aoTexture() {
  const R = 1024; const S = GROUND.TOTAL; const c = document.createElement('canvas'); c.width = c.height = R;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, R, R);
  const tx = x => (x - GROUND.X0) / S * R;
  g.filter = 'blur(5px)'; g.fillStyle = '#fff';
  for (const b of W.buildings) g.fillRect(tx(b.x0) - 2, tx(b.z0) - 2, (b.x1 - b.x0) / S * R + 4, (b.z1 - b.z0) / S * R + 4);
  for (const p of W.platforms) g.fillRect(tx(p.x0) - 2, tx(p.z0) - 2, (p.x1 - p.x0) / S * R + 4, (p.z1 - p.z0) / S * R + 4);
  g.filter = 'blur(2.5px)'; g.globalAlpha = 0.75;
  for (const p of W.props) {
    const r = { fountain: 2.8, bigfountain: 3.6, statue: 1.5, planter: 1.3, kiosk: 1.5, car: 1.6, tree: 1.4, pine: 1.2, streettree: 0.8, bush: 0.9, hedge: 0, dumpster: 1.2, flowers: 1.5, busstop: 1.1 }[p.type];
    if (!r || p.y) continue;
    g.beginPath(); g.arc(tx(p.x), tx(p.z), r / S * R, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1; g.filter = 'none';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}
