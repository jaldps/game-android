// Vegetation & rock geometries (built once) and shared materials with wind sway + near-camera dither fade.
import * as THREE from 'three';
import { mergeGeometries as mergeRaw, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
const mergeGeometries = arr => mergeRaw(arr.map(g => g.index ? g.toNonIndexed() : g));
import { mulberry, makeNoise } from './rng.js';
import { barkTexture, pineBranchTexture, leafClusterTexture, grassCardTexture, rockTexture, cactusTexture } from './textures.js';
import { U } from './terrain.js';

// ------------------------------------------------------------------ materials
const NOFLIP_NORMAL = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
export function windMaterial(params, { sway = 0.05, flutter = 0.03, card = false, fade = 2.6, key = 'w' } = {}) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
        #endif
        float ph = dot(ip.xz, vec2(0.13, 0.171));
        float hh = max(position.y, 0.0);
        float sw = sin(uTime * 1.3 + ph) * 0.7 + sin(uTime * 2.7 + ph * 1.7) * 0.3;
        transformed.x += sw * ${sway.toFixed(3)} * hh;
        transformed.z += cos(uTime * 1.1 + ph * 1.3) * ${(sway * 0.6).toFixed(3)} * hh;
        transformed.xyz += normal * sin(uTime * 5.0 + dot(position, vec3(3.1, 2.3, 2.9)) + ph) * ${flutter.toFixed(3)} * min(hh, 1.0);
      `);
    if (fade > 0) sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        { float cd = length(vViewPosition); float th = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (cd < ${fade.toFixed(2)} && th > (cd - 0.6) / ${(fade - 0.6).toFixed(2)}) discard; }`);
    if (card) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', NOFLIP_NORMAL)
      // fake translucency: light through leaves when backlit
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.12;');
  };
  m.customProgramCacheKey = () => key + sway + flutter + card + fade;
  return m;
}

// ------------------------------------------------------------------ helpers
function quad(p0, dirU, dirV, w, l, uv0, uv1, center, out, col = [1, 1, 1]) {
  // quad starting at p0 extending l along dirU, width w along dirV (centred)
  const P = [], N = [], UV = [];
  const corners = [[0, -0.5], [1, -0.5], [1, 0.5], [0, 0.5]];
  for (const [a, b] of corners) {
    const x = p0.x + dirU.x * l * a + dirV.x * w * b, y = p0.y + dirU.y * l * a + dirV.y * w * b, z = p0.z + dirU.z * l * a + dirV.z * w * b;
    P.push(x, y, z);
    const n = new THREE.Vector3(x - center.x, (y - center.y) * 0.7 + 0.6, z - center.z).normalize(); N.push(n.x, n.y, n.z);
    UV.push(uv0[0] + (uv1[0] - uv0[0]) * a, uv0[1] + (uv1[1] - uv0[1]) * (b + 0.5));
  }
  const base = out.pos.length / 3;
  out.pos.push(...P); out.nor.push(...N); out.uv.push(...UV);
  for (let i = 0; i < 4; i++) out.col.push(...col);
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function newBuf() { return { pos: [], nor: [], uv: [], col: [], idx: [] }; }
function bufGeo(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3)); g.setIndex(b.idx);
  g.computeBoundingSphere(); return g;
}
function colorize(g, c) { const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function gradientColor(g, y0, y1, c0, c1) {
  const p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))); for (let k = 0; k < 3; k++) a[i * 3 + k] = c0[k] + (c1[k] - c0[k]) * t; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const strip = g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); return g.index ? g : g; };
function trunkGeo(rb, rt, h, seg, bend = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 6, true); g.translate(0, h / 2, 0);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h; p.setX(i, p.getX(i) + Math.sin(y * 2.5) * bend * y); }
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * h / 2);
  g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------------ PINE (alpha branch cards around a trunk + opaque core)
export function makePine(variant = 0) {
  const R = mulberry(100 + variant);
  const H = 9 + variant * 2.2;
  const trunk = gradientColor(trunkGeo(0.34, 0.08, H * 0.98, 8, 0.15), 0, 3, [0.55, 0.55, 0.55], [1, 1, 1]);
  const b = newBuf(); const center = new THREE.Vector3(0, H * 0.45, 0);
  const tiers = 13 + variant * 2; const y0 = 1.6;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1); const y = y0 + f * (H - y0 - 0.3);
    const L = (1 - f) * (2.7 + variant * 0.4) + 0.35;
    const nb = f > 0.85 ? 4 : 7;
    for (let k = 0; k < nb; k++) {
      const a = k / nb * Math.PI * 2 + t * 0.73 + R() * 0.4;
      const droop = 0.25 + R() * 0.2 + (1 - f) * 0.15;
      const dir = new THREE.Vector3(Math.cos(a), -droop, Math.sin(a)).normalize();
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const tilt = (R() - 0.5) * 0.8; const up = new THREE.Vector3().crossVectors(side, dir).normalize();
      const wv = side.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(up, Math.sin(tilt));
      const shade = 0.55 + 0.45 * f + R() * 0.1;
      quad(new THREE.Vector3(0, y, 0), dir, wv, L * 0.62, L * (1.0 + R() * 0.15), [0.1, 0.0], [1, 1], center, b, [shade, shade, shade * 0.95]);
    }
  }
  // tip
  for (let k = 0; k < 2; k++) { const a = k * Math.PI / 2; quad(new THREE.Vector3(0, H - 1.3, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 0.7, 1.5, [0, 0], [1, 1], center, b, [1, 1, 1]); }
  const cards = bufGeo(b);
  // opaque core cone (UVs into solid atlas corner)
  const core = new THREE.ConeGeometry(1.25 + variant * 0.2, H - 2.2, 8, 3, true); core.translate(0, (H - 2.2) / 2 + 1.7, 0);
  const cu = core.attributes.uv; for (let i = 0; i < cu.count; i++) cu.setXY(i, 0.04 + cu.getX(i) * 0.04, 0.04 + cu.getY(i) * 0.04);
  gradientColor(core, 1.5, H, [0.35, 0.35, 0.35], [0.7, 0.7, 0.7]);
  return { trunk: strip(trunk), cards: mergeGeometries([cards, strip(core)]), h: H };
}

// ------------------------------------------------------------------ deciduous (autumn), olive, bush
export function makeLeafy(kind, variant = 0) {
  const R = mulberry(300 + variant * 17 + kind.length);
  let H, crownR, nClusters, trunkR, crownY;
  if (kind === 'autumn') { H = 6 + variant * 1.5; crownR = 2.6 + variant * 0.5; nClusters = 9; trunkR = 0.26; crownY = H * 0.72; }
  else if (kind === 'olive') { H = 3.2 + variant * 0.6; crownR = 1.9; nClusters = 7; trunkR = 0.2; crownY = H * 0.8; }
  else { H = 0.6; crownR = 0.8 + variant * 0.2; nClusters = 4; trunkR = 0; crownY = 0.55; }
  const parts = [];
  if (trunkR > 0) {
    parts.push(trunkGeo(trunkR * 1.3, trunkR * 0.6, crownY + 0.4, 7, kind === 'olive' ? 0.5 : 0.2));
    for (let k = 0; k < 3; k++) {
      const br = trunkGeo(trunkR * 0.55, trunkR * 0.2, crownR * 1.1, 5); const a = k * 2.1 + R();
      br.rotateZ(0.9); br.rotateY(a); br.translate(0, crownY * 0.75, 0); parts.push(br);
    }
  }
  const trunk = parts.length ? gradientColor(mergeGeometries(parts.map(strip)), 0, 2, [0.5, 0.5, 0.5], [1, 1, 1]) : null;
  const b = newBuf(); const center = new THREE.Vector3(0, crownY, 0);
  const cl = [];
  for (let c = 0; c < nClusters; c++) {
    const a = R() * Math.PI * 2, r = (c === 0 ? 0 : 0.45 + R() * 0.45) * crownR;
    cl.push(new THREE.Vector3(Math.cos(a) * r, crownY + (R() - 0.35) * crownR * 0.7 * (kind === 'bush' ? 0.4 : 1), Math.sin(a) * r));
  }
  for (const p of cl) {
    const cr = crownR * (0.55 + R() * 0.25);
    const nq = kind === 'bush' ? 7 : 11;
    for (let q = 0; q < nq; q++) {
      const dir = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
      const side = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).cross(dir).normalize();
      const s = cr * (1.1 + R() * 0.5);
      const p0 = p.clone().addScaledVector(dir, -s * 0.5);
      const up = (p.y - crownY + crownR) / (2 * crownR);
      const shade = 0.6 + 0.5 * Math.max(0, Math.min(1, up)) + R() * 0.1;
      quad(p0, dir, side, s, s, [0.1, 0.1], [1, 1], center, b, [shade, shade, shade]);
    }
  }
  const cards = bufGeo(b);
  // core blobs
  const cores = cl.slice(0, Math.min(5, cl.length)).map((p, i) => {
    const s = new THREE.IcosahedronGeometry(crownR * (0.5 + (i === 0 ? 0.15 : 0)), 1); s.translate(p.x, p.y, p.z);
    const u = s.attributes.uv; for (let k = 0; k < u.count; k++) u.setXY(k, 0.03 + u.getX(k) * 0.03, 0.03 + u.getY(k) * 0.03);
    return gradientColor(strip(s), crownY - crownR, crownY + crownR, [0.35, 0.35, 0.35], [0.75, 0.75, 0.75]);
  });
  return { trunk, cards: mergeGeometries([cards, ...cores]), h: H + crownR };
}

export function makeCypress(variant = 0) {
  const R = mulberry(700 + variant);
  const H = 6 + variant * 1.8;
  const trunk = colorize(strip(trunkGeo(0.16, 0.06, H * 0.5, 6)), [0.6, 0.6, 0.6]);
  const b = newBuf(); const center = new THREE.Vector3(0, H * 0.5, 0);
  for (let i = 0; i < 46; i++) {
    const t = R(); const y = 0.6 + t * (H - 0.6); const rad = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.75 + 0.15;
    const a = R() * 6.283; const p = new THREE.Vector3(Math.cos(a) * rad * 0.5, y, Math.sin(a) * rad * 0.5);
    const dir = new THREE.Vector3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize(); const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const shade = 0.55 + 0.45 * t;
    quad(p.clone().addScaledVector(dir, -0.6), dir, side, rad * 1.6, 1.4, [0.1, 0], [1, 1], center, b, [shade * 0.8, shade, shade * 0.8]);
  }
  const core = new THREE.CylinderGeometry(0.25, 0.6, H - 1, 7, 3, true); core.translate(0, H / 2 + 0.3, 0);
  const cu = core.attributes.uv; for (let i = 0; i < cu.count; i++) cu.setXY(i, 0.03 + cu.getX(i) * 0.03, 0.03 + cu.getY(i) * 0.03);
  return { trunk, cards: mergeGeometries([bufGeo(b), gradientColor(strip(core), 0, H, [0.3, 0.35, 0.3], [0.6, 0.7, 0.6])]), h: H };
}

export function makeCactus(variant = 0) {
  const R = mulberry(500 + variant);
  const parts = [];
  const H = 3.6 + variant * 1.3, r = 0.3 + variant * 0.04;
  const main = new THREE.CylinderGeometry(r, r * 1.08, H, 12, 8); main.translate(0, H / 2, 0); parts.push(main);
  const cap = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(0, H, 0); parts.push(cap);
  const arms = variant === 0 ? 1 : 2;
  for (let k = 0; k < arms; k++) {
    const side = k === 0 ? 1 : -1, ay = H * (0.35 + R() * 0.2), ah = H * (0.25 + R() * 0.2), ar = r * 0.72, out = 0.75;
    const elbow = new THREE.TorusGeometry(out * 0.5, ar, 8, 8, Math.PI / 2); elbow.rotateY(side > 0 ? 0 : Math.PI); elbow.rotateX(Math.PI); elbow.translate(side * out * 0.5, ay + out * 0.5, 0); parts.push(elbow);
    const up = new THREE.CylinderGeometry(ar, ar, ah, 10, 4); up.translate(side * out, ay + out * 0.5 + ah / 2, 0); parts.push(up);
    const c2 = new THREE.SphereGeometry(ar, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); c2.translate(side * out, ay + out * 0.5 + ah, 0); parts.push(c2);
  }
  const g = mergeGeometries(parts.map(p => strip(p.index ? p.toNonIndexed() : p)));
  // ribs: radial displacement by angle
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const a = Math.atan2(z, x); const k = 1 + 0.06 * Math.cos(a * 12); p.setX(i, x * k); p.setZ(i, z * k); }
  g.computeVertexNormals();
  gradientColor(g, 0, H, [0.75, 0.75, 0.7], [1.05, 1.05, 1]);
  return { trunk: g, cards: null, h: H };
}

export function makeGrassTuft(scale = 1) {
  const b = newBuf(); const center = new THREE.Vector3(0, -0.6, 0);
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3; const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    quad(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), side, 1.0 * scale, 0.5 * scale, [0, 0], [1, 1], center, b, [1, 1, 1]);
  }
  // uv: u along height -> map to texture v; swap so texture is upright
  const g = bufGeo(b); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
  gradientColor(g, 0, 0.5 * scale, [0.5, 0.5, 0.5], [1.1, 1.1, 1.1]);
  return g;
}

export function makeRock(variant = 0) {
  const N = makeNoise(900 + variant);
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const d = 1 + 0.3 * N.fbm(v.x * 1.3 + variant, v.y * 1.3 + v.z * 0.7, 3) + 0.07 * N.n2(v.x * 4, v.z * 4 + v.y);
    v.multiplyScalar(d);
    v.y = v.y > 0 ? v.y * (variant === 2 ? 1.1 : 0.72) : v.y * 0.5;
    // planar facets: snap toward a few cut planes for a chiselled look
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ay > ax && ay > az) { uv[i * 2] = x * 0.5; uv[i * 2 + 1] = z * 0.5; } else if (ax > az) { uv[i * 2] = z * 0.5; uv[i * 2 + 1] = y * 0.5; } else { uv[i * 2] = x * 0.5; uv[i * 2 + 1] = y * 0.5; } }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  gradientColor(g, -0.4, 0.9, [0.45, 0.45, 0.45], [1.1, 1.1, 1.1]);
  return g;
}

// ------------------------------------------------------------------ material sets per biome
export function foliageSet(biomeId, bio) {
  const S = {};
  const barkKind = biomeId === 'pine' ? 'pine' : biomeId === 'village' ? 'olive' : 'oak';
  S.trunkMat = windMaterial({ map: barkTexture(barkKind), roughness: 0.95, vertexColors: true }, { sway: 0.004, flutter: 0, key: 'trunk' });
  S.birchMat = windMaterial({ map: barkTexture('birch'), roughness: 0.9, vertexColors: true }, { sway: 0.004, flutter: 0, key: 'birch' });
  const card = (tex, key, extra = {}) => {
    // opaque atlas corner for core volumes
    const img = tex.image; const g = img.getContext('2d'); g.fillStyle = extra.core || '#2a4a22'; g.fillRect(0, img.height - 24, 24, 24); tex.needsUpdate = true;
    return windMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true, ...extra.p }, { sway: extra.sway ?? 0.02, flutter: extra.flutter ?? 0.04, card: true, key });
  };
  if (biomeId === 'pine') {
    const pt = pineBranchTexture();
    S.cardMat = card(pt, 'pine', { core: '#223f1c', sway: 0.018 });
    S.trees = [makePine(0), makePine(1), makePine(2)];
  } else if (biomeId === 'autumn') {
    const lt = leafClusterTexture('autumn');
    S.cardMat = card(lt, 'autumn', { core: '#d8d8d8', sway: 0.02, flutter: 0.05 });
    S.trees = [makeLeafy('autumn', 0), makeLeafy('autumn', 1), makeLeafy('autumn', 2)];
    S.pineCard = card(pineBranchTexture(), 'pine2', { core: '#223f1c', sway: 0.018 });
    S.pines = [makePine(1)];
  } else if (biomeId === 'village') {
    S.cardMat = card(leafClusterTexture('olive'), 'olive', { core: '#5e6e40', sway: 0.02 });
    S.trees = [makeLeafy('olive', 0), makeLeafy('olive', 1)];
    S.cypMat = card(pineBranchTexture(), 'cyp', { core: '#223f1c', sway: 0.012 });
    S.cypress = [makeCypress(0), makeCypress(1)];
    S.bougMat = card(leafClusterTexture('bougain'), 'boug', { core: '#c01a62', sway: 0.01 });
  } else {
    S.cactusMat = new THREE.MeshStandardMaterial({ map: cactusTexture(), roughness: 0.7, vertexColors: true });
    S.trees = [makeCactus(0), makeCactus(1)];
  }
  S.bushMat = card(leafClusterTexture('bush'), 'bush', { core: '#3e6a22', sway: 0.01 });
  S.bush = makeLeafy('bush', 0);
  const gk = bio.grassTuft;
  S.grassMat = windMaterial({ map: grassCardTexture(gk), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95, vertexColors: true }, { sway: 0.12, flutter: 0.02, card: true, fade: 0, key: 'grass' + gk });
  S.grass = makeGrassTuft(1);
  S.rockMat = new THREE.MeshStandardMaterial({ map: rockTexture(bio, biomeId), bumpMap: rockTexture(bio, biomeId), bumpScale: 2, roughness: 0.92, vertexColors: true });
  S.rocks = [makeRock(0), makeRock(1), makeRock(2)];
  return S;
}
