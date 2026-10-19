// Terrain height field built around the course: smoothed "mountain" base fitted to the track, natural hills,
// canyon walls, trail cut + shoulders + berm lips. Detailed 128 m tiles near the course, a coarse far mesh to the horizon,
// and the trail ribbon (dirt/cobble blended into the ground in-shader).
import * as THREE from 'three';
import { makeNoise, smoothstep, clamp } from './rng.js';
import { nearest, trackY, lerpArr } from './track.js';
import { groundTexture, trailTexture, rockTexture, noiseTexture } from './textures.js';

let T = null, BIO = null, NZ = null;
const BG = { x0: 0, z0: 0, nx: 0, nz: 0, cell: 10, h: null }; // base height grid
const _q = { i: 0, s: 0, u: 0, d: 0 };
let plane = [0, 0, 0];

export function initTerrain(track, bio, seed) {
  T = track; BIO = bio; NZ = makeNoise(seed * 3 + 1);
  // least-squares plane through the course
  let n = 0, sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0;
  for (let i = 0; i < T.N; i += 4) { const x = T.X[i], z = T.Z[i], y = T.Y[i]; n++; sx += x; sz += z; sy += y; sxx += x * x; szz += z * z; sxz += x * z; sxy += x * y; szy += z * y; }
  // solve 3x3 normal equations
  const A = [[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]], bb = [sy, sxy, szy];
  plane = solve3(A, bb);
  // kernel-smoothed course heights on a coarse grid (scatter)
  const M = 420; BG.x0 = T.minX - M; BG.z0 = T.minZ - M;
  BG.nx = Math.ceil((T.maxX - T.minX + 2 * M) / BG.cell) + 1; BG.nz = Math.ceil((T.maxZ - T.minZ + 2 * M) / BG.cell) + 1;
  const num = new Float32Array(BG.nx * BG.nz), den = new Float32Array(BG.nx * BG.nz);
  const sig = 34, cut = 105, rc = Math.ceil(cut / BG.cell);
  for (let i = 0; i < T.N; i += 3) {
    const cx = Math.round((T.X[i] - BG.x0) / BG.cell), cz = Math.round((T.Z[i] - BG.z0) / BG.cell);
    for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
      const X = cx + dx, Z = cz + dz; if (X < 0 || Z < 0 || X >= BG.nx || Z >= BG.nz) continue;
      const px = BG.x0 + X * BG.cell - T.X[i], pz = BG.z0 + Z * BG.cell - T.Z[i]; const d2 = px * px + pz * pz; if (d2 > cut * cut) continue;
      const w = Math.exp(-d2 / (2 * sig * sig)); const k = Z * BG.nx + X; num[k] += w * T.Y[i]; den[k] += w;
    }
  }
  BG.h = new Float32Array(BG.nx * BG.nz);
  for (let Z = 0; Z < BG.nz; Z++) for (let X = 0; X < BG.nx; X++) {
    const k = Z * BG.nx + X; const x = BG.x0 + X * BG.cell, z = BG.z0 + Z * BG.cell;
    const w0 = 0.04; BG.h[k] = (num[k] + w0 * planeY(x, z)) / (den[k] + w0);
  }
}
function solve3(A, b) {
  const m = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) { let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r; [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; } }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}
const planeY = (x, z) => plane[0] + plane[1] * x + plane[2] * z;
function baseGrid(x, z) {
  const fx = (x - BG.x0) / BG.cell, fz = (z - BG.z0) / BG.cell;
  if (fx < 0 || fz < 0 || fx >= BG.nx - 1 || fz >= BG.nz - 1) return planeY(x, z);
  const X = Math.floor(fx), Z = Math.floor(fz), tx = fx - X, tz = fz - Z, k = Z * BG.nx + X;
  const a = BG.h[k], b = BG.h[k + 1], c = BG.h[k + BG.nx], d = BG.h[k + BG.nx + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}
function hills(x, z) {
  const b = BIO;
  let h = NZ.fbm(x * 0.006, z * 0.006, 4) * b.hills + NZ.fbm(x * 0.022 + 7, z * 0.022, 3) * b.hills * 0.25;
  if (T.biome === 'desert') h += Math.max(0, NZ.ridge(x * 0.004, z * 0.004, 3) - 0.55) * 60;
  return h;
}
function wall(d, x, z) {
  if (!BIO.wall) return 0;
  const n = NZ.fbm(x * 0.012, z * 0.012, 3);
  const start = T.biome === 'desert' ? 13 + n * 5 : 18;
  let w = BIO.wall * smoothstep(start, start + (T.biome === 'desert' ? 9 : 30), d) * (0.75 + 0.35 * n);
  if (T.biome === 'desert') w += smoothstep(start + 9, start + 40, d) * 18 * (0.5 + 0.5 * NZ.fbm(x * 0.008 + 3, z * 0.008, 2));
  return w;
}
export function baseHeight(x, z) { return baseGrid(x, z) + hills(x, z); }

/** terrain height at world (x,z). dip=true sinks the ground under the trail ribbon (terrain mesh only). info receives nearest result */
export function heightAt(x, z, dip = false, info = null) {
  const ok = nearest(T, x, z, 160, _q);
  if (!ok) return baseHeight(x, z) + wall(160, x, z);
  const s = _q.s, u = _q.u, d = _q.d; const i = Math.round(s);
  const tw = T.W[i] * 0.5;
  const bank = lerpArr(T.BANK, s);
  const surf = trackY(T, s) + bank * clamp(u, -tw - 0.6, tw + 0.6);
  const n = NZ.n2(x * 0.035, z * 0.035);
  const sh = (T.biome === 'village' ? 4 : 6.5) + 4.5 * (n * 0.5 + 0.5);
  const t = smoothstep(tw + 0.35, tw + sh, d);
  const base = baseHeight(x, z) + wall(d, x, z);
  let h = surf + (base - surf) * t;
  if (u * bank > 0) { const e = (d - tw - 0.9) / 1.5; h += Math.abs(bank) * 2.4 * Math.exp(-e * e); }
  const e2 = (d - tw - 0.35) / 0.45; h += 0.1 * Math.exp(-e2 * e2);
  if (dip) h -= 0.28 * (1 - smoothstep(tw - 0.2, tw + 1.0, d));
  if (info) { info.s = s; info.u = u; info.d = d; info.tw = tw; }
  return h;
}

// ------------------------------------------------------------------ materials
export const U = { uTime: { value: 0 } };
function terrainChunk(groundSampler, uvExpr) {
  return `
    vec2 tuv = ${uvExpr};
    vec3 g1 = texture2D(${groundSampler}, tuv).rgb;
    vec3 g2 = texture2D(${groundSampler}, tuv * 0.27 + vec2(0.37, 0.11)).rgb;
    float mn = texture2D(tNoise, vWPos.xz * 0.0045).r;
    float mn2 = texture2D(tNoise, vWPos.xz * 0.027 + 0.3).r;
    vec3 gc = mix(g1, g2, 0.35 + 0.3 * (mn2 - 0.5));
    gc *= 0.74 + 0.52 * mn;
    gc = mix(gc, gc * uTint2, smoothstep(0.5, 0.78, mn2) * 0.8);
    float slope = 1.0 - normalize(vWN).y;
    float rk = smoothstep(uRockA, uRockB, slope + (mn2 - 0.5) * 0.3);
    vec2 ruv = vec2((vWPos.x + vWPos.z) * 0.06, vWPos.y * 0.075);
    vec3 rc = texture2D(tRock, ruv).rgb * (0.8 + 0.4 * mn);
    vec3 terr = mix(gc, rc, rk);
  `;
}
function commonUniforms(sh, extra) {
  Object.assign(sh.uniforms, extra);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
}
export function makeTerrainMaterial(bio, id) {
  const ground = groundTexture(bio, id), rock = rockTexture(bio, id), noise = noiseTexture();
  const m = new THREE.MeshStandardMaterial({ map: ground, bumpMap: ground, bumpScale: 1.6, roughness: 1, metalness: 0, vertexColors: true });
  const tint2 = new THREE.Color(id === 'desert' ? '#e0a070' : id === 'autumn' ? '#d08a40' : id === 'village' ? '#c8b880' : '#a8b860');
  m.onBeforeCompile = sh => {
    commonUniforms(sh, { tRock: { value: rock }, tNoise: { value: noise }, uTint2: { value: tint2 }, uRockA: { value: id === 'desert' ? 0.22 : 0.3 }, uRockB: { value: id === 'desert' ? 0.4 : 0.5 } });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN; uniform sampler2D tRock; uniform sampler2D tNoise; uniform vec3 uTint2; uniform float uRockA; uniform float uRockB;')
      .replace('#include <map_fragment>', terrainChunk('map', 'vMapUv') + 'diffuseColor.rgb *= terr;');
  };
  m.customProgramCacheKey = () => 'terrain_' + id;
  return m;
}
export function makeTrailMaterial(bio, id) {
  const ground = groundTexture(bio, id), rock = rockTexture(bio, id), noise = noiseTexture(), trail = trailTexture(bio, id);
  const m = new THREE.MeshStandardMaterial({ map: trail, bumpMap: trail, bumpScale: bio.trail === 'cobble' ? 3 : 1.6, roughness: bio.trail === 'cobble' ? 0.8 : 1, metalness: 0, vertexColors: true });
  const cobble = bio.trail === 'cobble';
  const tint2 = new THREE.Color(id === 'desert' ? '#e0a070' : id === 'autumn' ? '#d08a40' : id === 'village' ? '#c8b880' : '#a8b860');
  m.onBeforeCompile = sh => {
    commonUniforms(sh, { tRock: { value: rock }, tNoise: { value: noise }, tGround: { value: ground }, uTint2: { value: tint2 }, uRockA: { value: 0.3 }, uRockB: { value: 0.5 } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aT; varying vec3 vT;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvT = aT;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN; varying vec3 vT; uniform sampler2D tRock; uniform sampler2D tNoise; uniform sampler2D tGround; uniform vec3 uTint2; uniform float uRockA; uniform float uRockB;')
      .replace('#include <map_fragment>', terrainChunk('tGround', 'vWPos.xz * 0.25') + `
        float u = vT.x, tw = vT.y, s = vT.z;
        float n1 = texture2D(tNoise, vec2(s * 0.031, u * 0.05)).r;
        float n3 = texture2D(tNoise, vWPos.xz * 0.21).r;
        ${cobble ? `float edge = tw + 0.05; float m = 1.0 - smoothstep(edge - 0.06, edge + 0.06, abs(u));` :
        `float edge = tw - 0.1 + (n1 - 0.5) * 1.2 + (n3 - 0.5) * 0.6; float m = 1.0 - smoothstep(edge - 0.3, edge + 0.3, abs(u));`}
        vec4 dc = texture2D(map, vMapUv);
        float wob = sin(s * 0.045) * 0.35 + sin(s * 0.13 + 1.3) * 0.12;
        float du = abs(u - wob);
        float rut = exp(-pow((du - 0.45) / 0.15, 2.0));
        float worn = 1.0 - smoothstep(0.0, tw, du);
        vec3 tr = dc.rgb * (0.84 + 0.26 * worn);
        ${cobble ? `tr *= 1.0 - 0.25 * smoothstep(0.82, 1.0, abs(u) / tw); vec3 curb = vec3(0.86, 0.84, 0.8); tr = mix(tr, curb, smoothstep(tw - 0.32, tw - 0.22, abs(u)));` :
        `tr *= 1.0 - 0.2 * rut; tr *= 1.0 - 0.22 * smoothstep(0.5, 1.0, abs(u) / max(edge, 0.5)); tr *= 0.92 + 0.16 * n3;`}
        diffuseColor.rgb *= mix(terr, tr, m);
      `);
  };
  m.customProgramCacheKey = () => 'trail_' + id;
  return m;
}

// ------------------------------------------------------------------ AO occluders (filled by scenery before terrain meshes are built)
const OCC = { cell: 6, map: new Map() };
export function clearOccluders() { OCC.map.clear(); }
export function addOccluder(x, z, r, k = 0.4) {
  const key = Math.floor(x / OCC.cell) + ',' + Math.floor(z / OCC.cell);
  let a = OCC.map.get(key); if (!a) OCC.map.set(key, a = []); a.push(x, z, r, k);
}
function aoAt(x, z) {
  let ao = 1; const cx = Math.floor(x / OCC.cell), cz = Math.floor(z / OCC.cell);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const a = OCC.map.get((cx + dx) + ',' + (cz + dz)); if (!a) continue;
    for (let i = 0; i < a.length; i += 4) { const ex = x - a[i], ez = z - a[i + 1], r = a[i + 2]; const d2 = (ex * ex + ez * ez) / (r * r); if (d2 < 4) ao *= 1 - a[i + 3] * Math.exp(-d2 * 1.4); }
  }
  return ao;
}

// ------------------------------------------------------------------ meshes
const TILE = 128, SEG = 64;
export function buildTerrain(scene, mat) {
  const tiles = new Set();
  for (let i = 0; i < T.N; i += 6) {
    const r = 120;
    for (let tx = Math.floor((T.X[i] - r) / TILE); tx <= Math.floor((T.X[i] + r) / TILE); tx++)
      for (let tz = Math.floor((T.Z[i] - r) / TILE); tz <= Math.floor((T.Z[i] + r) / TILE); tz++) {
        const cx = (tx + 0.5) * TILE - T.X[i], cz = (tz + 0.5) * TILE - T.Z[i];
        if (Math.hypot(cx, cz) < r + TILE * 0.5) tiles.add(tx + ',' + tz);
      }
  }
  const meshes = [];
  for (const key of tiles) {
    const [tx, tz] = key.split(',').map(Number);
    const geo = tileGeometry(tx * TILE, tz * TILE, TILE, SEG, true);
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.matrixAutoUpdate = false;
    scene.add(m); meshes.push(m);
  }
  // far terrain to the horizon (coarse), sunk where detailed tiles exist
  const far = farGeometry(tiles);
  const fm = new THREE.Mesh(far, mat); fm.receiveShadow = false; fm.matrixAutoUpdate = false; scene.add(fm); meshes.push(fm);
  return meshes;
}

function tileGeometry(x0, z0, size, seg, detailed) {
  const n = seg + 1, st = size / seg;
  // extended grid (+1 border) for normals & cavity
  const E = n + 2; const H = new Float32Array(E * E);
  for (let j = 0; j < E; j++) for (let i = 0; i < E; i++) H[j * E + i] = heightAt(x0 + (i - 1) * st, z0 + (j - 1) * st, true);
  const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), col = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, e = (j + 1) * E + (i + 1);
    const x = x0 + i * st, z = z0 + j * st, y = H[e];
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    const hx = H[e + 1] - H[e - 1], hz = H[e + E] - H[e - E];
    let nx = -hx, ny = 2 * st, nz = -hz; const l = Math.hypot(nx, ny, nz); nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    uv[k * 2] = x * 0.25; uv[k * 2 + 1] = z * 0.25;
    const cav = (H[e + 1] + H[e - 1] + H[e + E] + H[e - E]) * 0.25 - y;
    let ao = clamp(1 - cav * 0.35, 0.6, 1.08) * (detailed ? aoAt(x, z) : 1);
    col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = ao;
  }
  const idx = new Uint32Array(seg * seg * 6); let p = 0;
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
function farGeometry(tiles) {
  const M = 1700, st = 34;
  const x0 = T.minX - M, z0 = T.minZ - M, nx = Math.ceil((T.maxX - T.minX + 2 * M) / st) + 1, nz = Math.ceil((T.maxZ - T.minZ + 2 * M) / st) + 1;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), col = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * st, z = z0 + j * st;
    const inTile = tiles.has(Math.floor(x / TILE) + ',' + Math.floor(z / TILE));
    let y;
    const ok = nearest(T, x, z, 200, _q);
    if (ok && _q.d < 150) y = heightAt(x, z); else y = baseHeight(x, z) + wall(200, x, z);
    // big far ridges rising away from the course
    const dist = ok ? _q.d : 200;
    y += smoothstep(140, 900, dist) * (40 + 70 * NZ.ridge(x * 0.0016, z * 0.0016, 4)) * (T.biome === 'village' ? 0.35 : 1);
    if (inTile) y -= 5;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; uv[k * 2] = x * 0.25; uv[k * 2 + 1] = z * 0.25;
    col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = 0.92;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let p = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

/** trail ribbon meshes, one per 100 m chunk. Lateral span covers the trail plus a feathered grass margin. */
export function buildTrail(scene, mat) {
  const CH = 100, meshes = [];
  const LAT = [-1.0, -0.8, -0.55, -0.3, -0.1, 0.1, 0.3, 0.55, 0.8, 1.0]; // fractions of (tw) inside, extended below
  const EXT = 2.8; // grass margin beyond trail edge
  for (let c0 = 0; c0 < T.N - 1; c0 += CH) {
    const c1 = Math.min(T.N - 1, c0 + CH);
    const rows = c1 - c0 + 1, cols = LAT.length + 4;
    const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2), at = new Float32Array(rows * cols * 3), col = new Float32Array(rows * cols * 3);
    for (let r = 0; r < rows; r++) {
      const i = c0 + r; const th = T.TH[i]; const rx = -Math.cos(th), rz = Math.sin(th); const tw = T.W[i] * 0.5;
      const lat = [-(tw + EXT), -(tw + 1.2), ...LAT.map(f => f * tw), tw + 1.2, tw + EXT];
      for (let c = 0; c < cols; c++) {
        const u = lat[c], k = r * cols + c;
        const x = T.X[i] + rx * u, z = T.Z[i] + rz * u;
        const y = heightAt(x, z) + 0.02;
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        uv[k * 2] = u * 0.25; uv[k * 2 + 1] = i * 0.25;
        at[k * 3] = u; at[k * 3 + 1] = tw; at[k * 3 + 2] = i;
        const ao = aoAt(x, z); col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = ao;
      }
    }
    const idx = []; for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; idx.push(a, b, d, b, e, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aT', new THREE.BufferAttribute(at, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m); meshes.push(m);
  }
  return meshes;
}
