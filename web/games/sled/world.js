// Endless chunked world: biomes (village, forest, river bridge, plaza, tunnel), instanced scenery, string-light bulbs.
import * as THREE from 'three';
import { Prefab } from './geom.js';
import * as P from './prefabs.js';
import { M } from './materials.js';
import { CHUNK, AHEAD, BEHIND, TRACK_HALF } from './config.js';
import { makeRng } from './rng.js';

const TINTS = ['#f6e7c8', '#eaa79c', '#ecc66a', '#93cbc3', '#abc8ea', '#f2b48a', '#cdb8e6', '#f4f0e6', '#e58f7a'];
const SLOTS = 10, BULBS_PER = 900, HALOS_PER = 60;

class Bulbs {
  constructor(scene, per, mat) {
    this.per = per; const n = per * SLOTS;
    this.pos = new Float32Array(n * 3).fill(0); for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -9999;
    this.col = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.pts = new THREE.Points(g, mat); this.pts.frustumCulled = false; scene.add(this.pts); this.fill = new Int32Array(SLOTS);
  }
  clearSlot(s) { const a = s * this.per; for (let i = a; i < a + this.per; i++) this.pos[i * 3 + 1] = -9999; this.fill[s] = 0; this.dirty = true; }
  push(s, x, y, z, c) { if (this.fill[s] >= this.per) return; const i = s * this.per + this.fill[s]++; this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b; this.dirty = true; }
  flush() { if (this.dirty) { this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true; this.dirty = false; } }
  shift(dz) { for (let i = 0; i < this.pos.length / 3; i++) this.pos[i * 3 + 2] += dz; this.dirty = true; }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    const mk = (def, cap, o) => { const d = def; const pf = new Prefab(scene, d.parts, cap, o); pf.def = d; return pf; };
    this.pf = {
      track: mk(P.trackPiece(), SLOTS, { receive: true }),
      groundV: mk(P.groundPiece('village'), SLOTS, {}),
      groundR: mk(P.groundPiece('river'), 4, {}),
      bridge: mk(P.bridge(), 4, { shadow: true }),
      tunnel: mk(P.tunnel(), 4, { shadow: false }),
      houseA: mk(P.houseA(), 36, { shadow: true, tint: ['plaster'] }),
      houseB: mk(P.houseB(), 30, { shadow: true, tint: ['plaster'] }),
      houseC: mk(P.houseC(), 30, { shadow: true, tint: ['plaster'] }),
      cabin: mk(P.cabin(), 14, { shadow: true }),
      pineA: mk(P.pine(4, 1), 320, { shadow: true }),
      pineB: mk(P.pine(5, 2.2), 260, { shadow: true }),
      rock: mk(P.rock(3), 90, { shadow: true }),
      lamp: mk(P.lampPost(), 70, { shadow: true }),
      wire: mk(P.wireSpan(), 40, {}),
      fence: mk(P.fence(), 120, { shadow: true }),
      bench: mk(P.bench(), 30, { shadow: true }),
      presents: mk(P.presents(), 40, { shadow: true }),
      snowman: mk(P.decoSnowman(), 20, { shadow: true }),
      stall: mk(P.stall(), 24, { shadow: true }),
      bigTree: mk(P.bigTree(), 4, { shadow: true }),
      barrels: mk(P.barrels(), 30, { shadow: true }),
    };
    this.bulbs = new Bulbs(scene, BULBS_PER, M.bulbs);
    const haloMat = M.bulbs.clone(); haloMat.size = 3.2; haloMat.opacity = 0.5; haloMat.onBeforeCompile = M.bulbs.onBeforeCompile; haloMat.customProgramCacheKey = M.bulbs.customProgramCacheKey;
    this.haloMat = haloMat;
    this.halos = new Bulbs(scene, HALOS_PER, haloMat);
    this.chunks = []; this.freeSlots = []; for (let i = SLOTS - 1; i >= 0; i--) this.freeSlots.push(i);
  }
  reset(seed) {
    for (const c of this.chunks) this._release(c);
    this.chunks = []; this.next = 0; this.rng = makeRng(seed * 7 + 11); this.plan = []; this.planBiome = null; this.biomeLeft = 0; this.zoff = 0;
  }
  _nextBiome() {
    const r = this.rng;
    if (this.next < 4) return 'village';
    if (this.biomeLeft > 0) { this.biomeLeft--; return this.planBiome; }
    const prev = this.planBiome || 'village';
    let b;
    if (prev === 'village') b = r.pick(['forest', 'forest', 'plaza', 'river', 'tunnel']);
    else if (prev === 'forest') b = r.pick(['village', 'village', 'river', 'tunnel']);
    else if (prev === 'plaza') b = 'village';
    else if (prev === 'river') b = r.pick(['forest', 'village']);
    else b = r.pick(['village', 'forest']);
    this.planBiome = b; this.biomeLeft = (b === 'village' ? r.int(2, 4) : b === 'forest' ? r.int(2, 4) : b === 'tunnel' ? 1 : 0);
    return b;
  }
  biomeAt(z) { for (const c of this.chunks) if (z <= c.z0 && z > c.z0 - CHUNK) return c.biome; return 'village'; }
  update(pz) {
    while (-this.next * CHUNK + this.zoff > pz - AHEAD) this._spawn();
    while (this.chunks.length && this.chunks[0].z0 - CHUNK > pz + BEHIND) this._release(this.chunks.shift());
    this.bulbs.flush(); this.halos.flush();
  }
  _add(c, name, x, y, z, ry = 0, s = 1, tint = null, rx = 0, rz = 0) {
    const pf = this.pf[name]; const h = pf.add(x, y, z, ry, s, tint, rx, rz); if (h < 0) return;
    c.items.push(pf, h);
    const d = pf.def, cs = Math.cos(ry), sn = Math.sin(ry);
    const tr = (b) => [x + (b[0] * cs + b[2] * sn) * s, y + b[1] * s, z + (-b[0] * sn + b[2] * cs) * s];
    if (d.bulbs) for (const b of d.bulbs) { const p = tr(b); this.bulbs.push(c.slot, p[0], p[1], p[2], P.BULB_COLS[b[3]]); }
    if (d.halo) for (const b of d.halo) { const p = tr(b); this.halos.push(c.slot, p[0], p[1], p[2], HALO_COL); }
    if (d.smoke) for (const b of d.smoke) c.smoke.push(tr(b));
  }
  _spawn() {
    const idx = this.next++, z0 = -idx * CHUNK + this.zoff, biome = this._nextBiome();
    const slot = this.freeSlots.pop();
    const c = { idx, z0, biome, items: [], slot, smoke: [] };
    this.bulbs.clearSlot(slot); this.halos.clearSlot(slot);
    const r = this.rng;
    if (biome === 'river') { this._add(c, 'bridge', 0, 0, z0); this._add(c, 'groundR', 0, 0, z0); }
    else { this._add(c, 'track', 0, 0, z0); this._add(c, 'groundV', 0, 0, z0); }
    const XP = P.XP;
    const lampsAndWires = (zs, wires = true) => { for (const z of zs) { this._add(c, 'lamp', -XP, 0, z, 0); this._add(c, 'lamp', XP, 0, z, Math.PI); if (wires) this._add(c, 'wire', 0, 0, z); } };
    const pines = (n, x0, x1, big = 0.3) => { for (let i = 0; i < n; i++) { const s = r() < 0.5 ? -1 : 1, x = s * r.range(x0, x1), z = z0 - r() * CHUNK; this._add(c, r() < big ? 'pineB' : 'pineA', x, 0.4 + Math.max(0, (Math.abs(x) - 14)) * 0.03, z, r() * 6, r.range(0.8, 1.6)); } };
    if (biome === 'village' || biome === 'plaza') {
      for (const s of [-1, 1]) {
        let z = z0 - r.range(0, 2);
        const ry = s < 0 ? 0 : Math.PI;
        while (z > z0 - CHUNK + 2) {
          if (biome === 'plaza') {
            const k = r(); 
            if (k < 0.5) { this._add(c, 'stall', s * (TRACK_HALF + 3.4), 0.4, z - 1.8, ry); z -= 4.6; }
            else { this._add(c, r() < 0.5 ? 'presents' : 'barrels', s * (TRACK_HALF + 3.0), 0.4, z - 1, r() * 6, r.range(0.9, 1.2)); z -= 3; }
            continue;
          }
          const t = r(); let D, Wd, name;
          if (t < 0.38) { name = 'houseA'; D = 5.6; Wd = 6.4; } else if (t < 0.72) { name = 'houseB'; D = 5.2; Wd = 8.6; } else { name = 'houseC'; D = 5; Wd = 5; }
          if (z - Wd < z0 - CHUNK) break;
          const xh = s * (TRACK_HALF + 3.6 + D / 2 + r.range(0, 0.8));
          this._add(c, name, xh, 0.42, z - Wd / 2, ry, r.range(0.95, 1.1), r.pick(TINTS));
          z -= Wd;
          const gap = r.range(1.2, 3.2);
          const pr = r();
          if (pr < 0.3) this._add(c, 'presents', s * (TRACK_HALF + 2.6), 0.45, z - gap / 2, r() * 6);
          else if (pr < 0.5) this._add(c, 'bench', s * (TRACK_HALF + 2.3), 0.45, z - gap / 2, ry);
          else if (pr < 0.65) this._add(c, 'barrels', s * (TRACK_HALF + 2.6), 0.45, z - gap / 2, r() * 6);
          else if (pr < 0.8) this._add(c, 'pineA', s * (TRACK_HALF + 3.6), 0.45, z - gap / 2, r() * 6, 0.6);
          z -= gap;
        }
        // second row: bigger houses further back + pines
        let z2 = z0 - r.range(0, 4);
        while (z2 > z0 - CHUNK + 4) { const nm = r.pick(['houseA', 'houseB', 'houseC']); this._add(c, nm, s * r.range(19, 23), 0.55, z2 - 4, ry + r.range(-0.2, 0.2), r.range(1.0, 1.25), r.pick(TINTS)); z2 -= r.range(9, 13); }
      }
      if (biome === 'plaza') { const s = (idx % 2) ? 1 : -1; this._add(c, 'bigTree', s * 12.5, 0.4, z0 - 20, 0, 1.25); this._add(c, 'presents', s * 11, 0.4, z0 - 18, 1); this._add(c, 'presents', s * 13.8, 0.4, z0 - 21.5, 2); }
      lampsAndWires([z0 - 3, z0 - 23]);
      pines(14, 26, 60, 0.5);
    } else if (biome === 'forest') {
      pines(46, 6.5, 48, 0.35);
      for (let i = 0; i < 5; i++) { const s = r() < 0.5 ? -1 : 1; this._add(c, 'rock', s * r.range(6, 20), 0.3, z0 - r() * CHUNK, r() * 6, r.range(0.6, 1.6)); }
      for (const s of [-1, 1]) for (let z = z0 - 2; z > z0 - CHUNK + 4; z -= 4) if (r() < 0.7) this._add(c, 'fence', s * (TRACK_HALF + 1.9), 0.45, z, 0);
      if (r() < 0.5) { const s = r() < 0.5 ? -1 : 1; this._add(c, 'cabin', s * 11, 0.42, z0 - r.range(8, 30), s < 0 ? 0 : Math.PI, 1.1); }
      if (r() < 0.4) { const s = r() < 0.5 ? -1 : 1; this._add(c, 'snowman', s * (TRACK_HALF + 3.5), 0.45, z0 - r() * CHUNK, s < 0 ? 0 : Math.PI); }
      lampsAndWires([z0 - 10], r() < 0.5);
    } else if (biome === 'river') {
      lampsAndWires([z0 - 4, z0 - 24]);
      pines(18, 20, 55, 0.4);
      for (let i = 0; i < 4; i++) { const s = r() < 0.5 ? -1 : 1; this._add(c, 'rock', s * r.range(15, 19), -1.2, z0 - r() * CHUNK, r() * 6, r.range(0.8, 1.8)); }
    } else if (biome === 'tunnel') {
      this._add(c, 'tunnel', 0, 0, z0);
      pines(20, 24, 55, 0.4);
      // tunnel lantern halos
      for (let z = z0 - 2; z > z0 - CHUNK; z -= 6) for (const s of [-1, 1]) this.halos.push(slot, s * (TRACK_HALF + 0.85), 3.4, z, HALO_COL);
    }
    this.chunks.push(c);
  }
  _release(c) { for (let i = 0; i < c.items.length; i += 2) c.items[i].remove(c.items[i + 1]); this.bulbs.clearSlot(c.slot); this.halos.clearSlot(c.slot); this.freeSlots.push(c.slot); }
  shift(dz) { for (const c of this.chunks) { c.z0 += dz; for (const s of c.smoke) s[2] += dz; } this.bulbs.shift(dz); this.halos.shift(dz); this.zoff += dz; }
  // after a rebase the chunk index -> z mapping changes; we keep a base offset
}
const HALO_COL = new THREE.Color('#ffc46b');
