// Holes: visual (cut-out + inner wall + rim + ground AO ring), movement, growth and the swallow physics.
import * as THREE from 'three';
import { CITY, HOLE, levelRadius, levelMass, objectMass } from './config.js';
import { U, MAX_HOLES, paintDamage } from './materials.js';
import { gridQuery, gridRemove, writeObject, hideObject } from './objects.js';
import { rand, range } from './rng.js';
const _up = new THREE.Vector3(0, 1, 0);

export const holes = [];
export const events = [];
const _near = [];
const leaning = new Set();
const falling = new Set();
const _dq = new THREE.Quaternion(), _ax = new THREE.Vector3();
const TOP = CITY.CURB_H + 0.012;

// ---- shared geometries
const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 56, 6, true); wallGeo.translate(0, -0.5, 0);
// A thinner, more solid lip: the fat pale donut washed the ground out (critic fix 7).
const rimProfile = [[0.982, -0.40], [0.990, 0.03], [1.0, 0.078], [1.026, 0.105], [1.072, 0.112], [1.112, 0.092], [1.133, 0.048], [1.14, -0.02], [1.14, -0.34]].reverse().map(p => new THREE.Vector2(p[0], p[1]));
const rimGeo = new THREE.LatheGeometry(rimProfile, 72);
const AO_IN = 1.13, AO_OUT = 1.56;
const aoGeo = new THREE.RingGeometry(AO_IN, AO_OUT, 64, 1); aoGeo.rotateX(-Math.PI / 2);
const bottomGeo = new THREE.CircleGeometry(1, 32); bottomGeo.rotateX(-Math.PI / 2);

const GLOW_IN = 1.06, GLOW_OUT = 1.40;
const glowGeo = new THREE.RingGeometry(GLOW_IN, GLOW_OUT, 64, 1); glowGeo.rotateX(-Math.PI / 2);
{ const p = glowGeo.attributes.position, uv = glowGeo.attributes.uv; for (let i = 0; i < p.count; i++) { const rr = Math.hypot(p.getX(i), p.getZ(i)); uv.setXY(i, (rr - GLOW_IN) / (GLOW_OUT - GLOW_IN), 0.5); } }
const xrayGeo = new THREE.RingGeometry(1.15, 1.23, 72, 1); xrayGeo.rotateX(-Math.PI / 2);
let GLOW_TEX = null;
function glowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.42, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
function aoTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
let AO_TEX = null;

function wallMaterial(color) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uCol: { value: new THREE.Color(color) }, uR: { value: 1 }, uTime: U.uTime },
    vertexShader: `varying vec3 vP; varying vec3 vW; void main(){ vP = position; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uR; uniform float uTime; varying vec3 vP; varying vec3 vW;
      float h12(vec2 p){ vec3 q = fract(vec3(p.xyx)*.1031); q += dot(q, q.yzx+33.33); return fract((q.x+q.y)*q.z); }
      void main(){
        // Depth measured in hole radii, so the pit reads the same at LV1 and LV30. From a 45°
        // camera the near lip hides everything past dn = 2, which is exactly where we reach black.
        float dn = -vW.y / max(0.8, uR);
        float ang = atan(vP.z, vP.x);
        // broken strata and torn chunks — never a smooth tube
        float stri = 0.84 + 0.16*sin(ang*17.0 + dn*5.0) * (0.5 + 0.5*sin(ang*41.0 - dn*11.0));
        float chunk = 0.86 + 0.14*h12(vec2(floor(ang*26.0), floor(dn*13.0)));
        // 1) sunlit excavated earth at the top, losing light as it drops away
        float lit = exp(-dn*1.22);
        vec3 earth = mix(vec3(0.50,0.36,0.22), vec3(0.17,0.12,0.08), clamp(dn*0.72, 0.0, 1.0));
        vec3 c = earth * lit * stri * chunk;
        // 2) a little rim colour bounces onto the top of the shaft
        c += uCol * 0.15 * exp(-dn*3.2) * stri;
        // 3) hard contact shadow just beneath the lip, then the bright lip itself
        c *= 1.0 - 0.52 * smoothstep(0.0, 0.10, dn) * (1.0 - smoothstep(0.10, 0.44, dn));
        c += uCol * 0.60 * smoothstep(0.055, 0.0, dn);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function rimMaterial(skin) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: skin.style === 6 ? 0.22 : 0.32, metalness: skin.style === 6 ? 0.85 : 0.05, envMapIntensity: 1.2 });
  m.userData.u = { uA: { value: new THREE.Color(skin.a) }, uB: { value: new THREE.Color(skin.b) }, uStyle: { value: skin.style } };
  m.customProgramCacheKey = () => 'rim';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u, { uTime: U.uTime });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uA; uniform vec3 uB; uniform float uStyle; uniform float uTime; varying vec3 vLP;
float rh(float n){ return fract(sin(n)*43758.5453); }
vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
`).replace('#include <color_fragment>', `
{
  float ang = atan(vLP.z, vLP.x); float t = uTime;
  float rr = length(vLP.xz);
  float topk = smoothstep(0.0, 0.1, vLP.y);
  vec3 c = uA; vec3 e = vec3(0.0);
  int st = int(uStyle + 0.5);
  if (st == 0) { c = mix(uA, uB, topk * smoothstep(1.11, 1.02, rr) * 0.62); }
  else if (st == 1) { c = mix(uA, uB, 0.5 + 0.5*sin(ang*2.0 + t*0.8)); }
  else if (st == 2) { float p = 0.5 + 0.5*sin(ang*10.0 - t*4.0); c = mix(uA, uB, p*0.6); e = uA * 0.35 * (0.6 + 0.4*p); }
  else if (st == 3) { float s = step(0.5, fract(ang*12.0/6.2831 + t*0.25)); c = mix(uA, uB, s); }
  else if (st == 4) { c = mix(uA*0.55, uB, 0.5 + 0.5*sin(ang*3.0 + t)); float cell = floor(ang*40.0); float tw = step(0.93, rh(cell + floor(t*3.0 + cell))); c += tw * 0.8; e = c * 0.15; }
  else if (st == 5) { float n = sin(ang*7.0 + t*2.0)*0.5 + sin(ang*13.0 - t*3.1)*0.5; c = mix(uA, uB, 0.5+0.5*n); e = c * 0.5; }
  else if (st == 6) { c = mix(uA, uB, 0.3 + 0.3*sin(ang*6.0 + t*1.5)); }
  else { c = hue(ang/6.2831 + t*0.12) * 0.9 + 0.08; e = c * 0.25; }
  diffuseColor.rgb = c;
  totalEmissiveRadiance += e + c * 0.15;
}
`);
  };
  return m;
}
export function setRimSkin(h, skin) {
  const u = h.rimMat.userData.u; u.uA.value.set(skin.a); u.uB.value.set(skin.b); u.uStyle.value = skin.style;
  h.rimMat.metalness = skin.style === 6 ? 0.85 : 0.05; h.rimMat.roughness = skin.style === 6 ? 0.22 : 0.32;
  h.wallMat.uniforms.uCol.value.set(skin.a); h.color = skin.a; h.glow.material.color.set(skin.a); if (h.xray) h.xray.material.color.set(skin.b);
}

export class Hole {
  constructor(scene, o) {
    this.name = o.name; this.isPlayer = !!o.isPlayer; this.color = o.skin.a;
    this.x = o.x; this.z = o.z; this.vx = 0; this.vz = 0; this.dirX = 0; this.dirZ = 0;
    this.level = o.level || 1; this.mass = 0; this.r = levelRadius(this.level); this.targetR = this.r;
    this.score = 0; this.eaten = 0; this.holesEaten = 0; this.combo = 0; this.lastEat = -9; this.alive = true; this.respawnT = 0;
    this.invuln = 2.5; this.maxLevel = this.level; this.bestCombo = 0; this.ai = null; this.input = { x: 0, z: 0 };
    this.group = new THREE.Group(); scene.add(this.group);
    this.wallMat = wallMaterial(o.skin.a);
    this.wall = new THREE.Mesh(wallGeo, this.wallMat); this.wall.position.y = TOP; this.wall.renderOrder = -1;
    this.bottom = new THREE.Mesh(bottomGeo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this.rimMat = rimMaterial(o.skin);
    this.rim = new THREE.Mesh(rimGeo, this.rimMat); this.rim.position.y = TOP; this.rim.castShadow = false; this.rim.receiveShadow = true;
    if (!AO_TEX) { AO_TEX = aoTexture(); GLOW_TEX = glowTexture(); }
    this.ao = new THREE.Mesh(aoGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.46, alphaMap: AO_TEX, depthWrite: false }));
    // ring UVs: RingGeometry uv.x isn't radial, so remap
    this.ao.position.y = TOP + 0.002; this.ao.renderOrder = 2;
    this.group.add(this.wall, this.bottom, this.rim, this.ao);
    // glow halo on the ground (additive) and an x-ray outline visible through buildings
    this.glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: o.skin.a, transparent: true, opacity: 0.09, alphaMap: GLOW_TEX, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.glow.position.y = TOP + 0.004; this.glow.renderOrder = 3; this.group.add(this.glow);
    this.pulse = 0;   // halo only flares when the hole grows
    if (this.isPlayer) {
      this.xray = new THREE.Mesh(xrayGeo, new THREE.MeshBasicMaterial({ color: o.skin.b, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, toneMapped: false }));
      this.xray.position.y = TOP + 0.15; this.xray.renderOrder = 10; this.group.add(this.xray);
    }
    this.updateVisual();
  }
  get depth() { return Math.max(4.5, this.r * 3.2); }
  updateVisual() {
    const r = this.r;
    this.group.position.set(this.x, 0, this.z);
    this.wall.scale.set(r * 1.0, this.depth, r * 1.0);
    this.wallMat.uniforms.uR.value = r;
    this.bottom.position.y = TOP - this.depth + 0.01; this.bottom.scale.setScalar(r);
    const ys = Math.min(2.2, 0.75 + r * 0.22);
    this.rim.scale.set(r, ys, r);
    this.ao.scale.set(r, 1, r);
    this.glow.scale.set(r * (1 + this.pulse * 0.10), 1, r * (1 + this.pulse * 0.10));
    this.glow.material.opacity = 0.085 + this.pulse * 0.55;
    if (this.xray) this.xray.scale.set(r, 1, r);
    this.group.visible = this.alive;
  }
  addMass(m) {
    this.mass += m;
    while (this.level < HOLE.MAX_LEVEL && this.mass >= levelMass(this.level)) {
      this.mass -= levelMass(this.level); this.level++; this.targetR = levelRadius(this.level);
      this.maxLevel = Math.max(this.maxLevel, this.level);
      this.pulse = 1;
      events.push({ type: 'level', hole: this });
    }
  }
  get progress() { return this.level >= HOLE.MAX_LEVEL ? 1 : Math.min(1, this.mass / levelMass(this.level)); }
}
// RingGeometry -> radial alpha uv
{ const p = aoGeo.attributes.position, uv = aoGeo.attributes.uv; for (let i = 0; i < p.count; i++) { const rr = Math.hypot(p.getX(i), p.getZ(i)); uv.setXY(i, (rr - AO_IN) / (AO_OUT - AO_IN), 0.5); } }

export function clearHoles(scene) { for (const h of holes) scene.remove(h.group); holes.length = 0; leaning.clear(); falling.clear(); events.length = 0; }

export function updateUniforms() {
  let n = 0;
  for (const h of holes) {
    if (!h.alive || n >= MAX_HOLES) continue;
    U.uHoles.value[n].set(h.x, h.z, h.r * 0.995, 0); n++;
  }
  U.uHoleN.value = n;
}

function startFall(o, h, time) {
  o.state = 1; gridRemove(o);
  const rx = o.x - h.x, rz = o.z - h.z; const d = Math.hypot(rx, rz) || 1;
  const inv = Math.max(0, 1 - o.size / h.r);
  // tall things hinge over the lip from their base instead of dropping in upright
  const topple = o.h > Math.max(1.6, o.size * 1.45) && o.kind !== 'person';
  o.pivot = topple ? 0.04 : 0.5;
  o.fall = {
    hole: h, vx: h.vx * 0.6 - rx / d * (topple ? 0.5 : 1.5), vy: 0, vz: h.vz * 0.6 - rz / d * (topple ? 0.5 : 1.5),
    wx: (rand() - 0.5) * 3 * inv, wy: (rand() - 0.5) * 2 * inv, wz: (rand() - 0.5) * 3 * inv,
    t: 0, inv, topple, ang: 0, angV: topple ? 0.35 + rand() * 0.3 : 0, spin: (rand() - 0.5) * 0.9,
  };
  o.lean = 0; leaning.delete(o);
  if (o.kind === 'person') { const p = o.parts[0]; p.pool.setAttr('aAnim', p.id, rand() * 6, 1, 9); }
  falling.add(o);
  // only a swallowed building leaves a real excavation; a bench just scuffs the paving
  paintDamage(o.x, o.z, Math.max(1.4, o.size * 1.7), (o.kind === 'building' || o.kind === 'mega') ? 1 : 0.28);
  // scoring + growth
  if (time - h.lastEat < 0.75) h.combo++; else h.combo = 1;
  h.lastEat = time; h.bestCombo = Math.max(h.bestCombo, h.combo);
  const bonus = 1 + Math.min(h.combo, 30) * 0.04;
  const pts = Math.max(1, Math.round(o.value * bonus));
  h.score += pts; h.eaten++;
  h.addMass(objectMass(o.size) * (h.isPlayer ? 1 : HOLE.BOT_GROW) * (h.growMul ?? 1));
  events.push({ type: 'eat', hole: h, obj: o, pts });
}

export function updateHoles(dt, time) {
  // leaning targets reset
  for (const o of leaning) o.leanT = 0;
  // Rubber band: whoever is behind the leader feeds faster — player included. Bots get no free
  // growth any more (BOT_GROW 1.0), so the only edge anyone has is being behind, and the race
  // stays live to the whistle instead of one hole snowballing away from the field.
  let topScore = 0; for (const h of holes) if (h.score > topScore) topScore = h.score;
  for (const h of holes) h.growMul = 1 + HOLE.BOT_RUBBER * Math.min(1, Math.max(0, (topScore - h.score) / Math.max(80, topScore)));
  for (const h of holes) {
    if (!h.alive) {
      h.respawnT -= dt;
      if (h.respawnT <= 0) respawn(h);
      continue;
    }
    h.invuln = Math.max(0, h.invuln - dt);
    h.pulse = Math.max(0, (h.pulse || 0) - dt * 1.9);
    h.dmgT = (h.dmgT || 0) - dt;
    // the hole's own path only scuffs the surface; full excavation is reserved for swallowed buildings
    if (h.dmgT <= 0) { h.dmgT = 0.09; paintDamage(h.x, h.z, h.r * 0.88, 0.42); }
    // movement
    const spd = HOLE.SPEED_BASE + HOLE.SPEED_PER_R * h.r;
    const tvx = h.input.x * spd, tvz = h.input.z * spd;
    const k = Math.min(1, dt * 7);
    h.vx += (tvx - h.vx) * k; h.vz += (tvz - h.vz) * k;
    h.x += h.vx * dt; h.z += h.vz * dt;
    const lim = CITY.HALF - h.r * 0.85 - 0.3;
    if (h.x < -lim) { h.x = -lim; h.vx = Math.max(0, h.vx); } if (h.x > lim) { h.x = lim; h.vx = Math.min(0, h.vx); }
    if (h.z < -lim) { h.z = -lim; h.vz = Math.max(0, h.vz); } if (h.z > lim) { h.z = lim; h.vz = Math.min(0, h.vz); }
    if (h.r !== h.targetR) { h.r += (h.targetR - h.r) * Math.min(1, dt * 3.2); if (Math.abs(h.targetR - h.r) < 0.002) h.r = h.targetR; }
    if (time - h.lastEat > 0.75) h.combo = 0;
    // swallow test
    gridQuery(h.x, h.z, h.r + 9, _near);
    const fitR = h.r * HOLE.FIT;
    for (let i = 0; i < _near.length; i++) {
      const o = _near[i]; if (o.state !== 0) continue;
      const dx = o.x - h.x, dz = o.z - h.z; const d = Math.hypot(dx, dz);
      if (o.size < fitR) {
        if (d < h.r - o.size * 0.3 || d < h.r * 0.5) startFall(o, h, time);
        else if (d < h.r + o.size * 0.5) {
          // overhanging the rim: tilt toward the hole
          const over = 1 - (d - (h.r - o.size * 0.3)) / (o.size * 0.8);
          const t = Math.max(0, Math.min(1, over)) * 0.55;
          if (t > (o.leanT || 0)) { o.leanT = t; o.leanX = -dx / (d || 1); o.leanZ = -dz / (d || 1); leaning.add(o); }
        }
      } else if (d < h.r + o.size * 0.55 && o.kind !== 'person') {
        // too big: rock and shudder at the lip
        const amt = Math.min(1, (h.r + o.size * 0.55 - d) / (o.size * 0.8)) * Math.min(0.12, 0.6 * h.r / o.size) * (0.6 + 0.4 * Math.sin(time * 26 + o.id));
        if (amt > (o.leanT || 0)) { o.leanT = amt; o.leanX = -dx / (d || 1); o.leanZ = -dz / (d || 1); leaning.add(o); }
      }
    }
  }
  // hole vs hole
  for (const a of holes) for (const b of holes) {
    if (a === b || !a.alive || !b.alive || b.invuln > 0) continue;
    if (a.r > b.r * HOLE.EAT_HOLE_RATIO) {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < a.r - b.r * 0.35) {
        b.alive = false; b.respawnT = 3.0; b.group.visible = false; b.deaths = (b.deaths || 0) + 1;
        const pts = 40 + Math.round(b.score * 0.15);
        a.score += pts; a.holesEaten++; a.addMass(levelMass(b.level) * 1.5 + 3);
        events.push({ type: 'eatHole', hole: a, victim: b, pts });
      }
    }
  }
  // leaning
  for (const o of leaning) {
    const t = o.leanT || 0;
    o.lean += (t - o.lean) * Math.min(1, dt * 10);
    o.dirty = true;
    if (t === 0 && o.lean < 0.002) { o.lean = 0; leaning.delete(o); }
  }
  // falling physics
  for (const o of falling) stepFall(o, dt);
}

function stepFall(o, dt) {
  const f = o.fall, h = f.hole;
  f.t += dt;
  const rx = o.x - h.x, rz = o.z - h.z; const d = Math.hypot(rx, rz) || 1e-3;
  const dirX = -rx / d, dirZ = -rz / d;
  const onRim = o.y > -o.h * 0.35 && d > h.r - o.size * 1.1;
  if (f.topple) {
    // hinge over the lip: the rim holds the base up until the thing is past its tipping point,
    // then the whole mass swings down into the pit.
    f.angV = Math.min(3.6, f.angV + (2.4 + 3.4 * f.inv) * dt);
    f.ang += f.angV * dt;
    _ax.set(dirZ, 0, -dirX); _dq.setFromAxisAngle(_ax, f.angV * dt); o.q.premultiply(_dq);
    if (Math.abs(f.spin) > 1e-3) { _dq.setFromAxisAngle(_up, f.spin * dt); o.q.multiply(_dq); }
    const grip = Math.max(0, 1 - f.ang / 1.05);           // 1 while still standing, 0 once committed
    f.vy -= (4 + 30 * (1 - grip)) * dt;
    if (f.vy < -38) f.vy = -38;
    const pull = (2.5 + 9 * (d / h.r)) * (1 - grip * 0.75);
    f.vx += dirX * pull * dt; f.vz += dirZ * pull * dt;
  } else {
    f.vy -= (onRim ? 9 : 30) * dt;
    if (f.vy < -40) f.vy = -40;
    const pull = 8 + 16 * (d / h.r);
    f.vx += dirX * pull * dt; f.vz += dirZ * pull * dt;
    const tip = (onRim ? (2.2 + 7 * f.inv * f.inv) : 0.6 + 2.0 * f.inv) * dt;
    f.wx += dirZ * tip * 2.2; f.wz += -dirX * tip * 2.2;
    const wl = Math.hypot(f.wx, f.wy, f.wz);
    const maxW = 1.2 + 6 * f.inv; if (wl > maxW) { f.wx *= maxW / wl; f.wy *= maxW / wl; f.wz *= maxW / wl; }
    if (wl > 1e-4) { _ax.set(f.wx / wl, f.wy / wl, f.wz / wl); _dq.setFromAxisAngle(_ax, wl * dt); o.q.premultiply(_dq); }
  }
  f.vx += (h.vx - f.vx) * Math.min(1, dt * 2.5); f.vz += (h.vz - f.vz) * Math.min(1, dt * 2.5);
  o.x += f.vx * dt; o.z += f.vz * dt; o.y += f.vy * dt;
  // stay inside the shaft
  const nx = o.x - h.x, nz = o.z - h.z; const nd = Math.hypot(nx, nz);
  const maxD = Math.max(0, h.r - o.size * (f.topple ? 0.25 : 0.75));
  if (nd > maxD && nd > 1e-4) {
    o.x = h.x + nx / nd * maxD; o.z = h.z + nz / nd * maxD;
    const vn = (f.vx * nx + f.vz * nz) / nd; if (vn > 0) { f.vx -= vn * nx / nd * 1.3; f.vz -= vn * nz / nd * 1.3; }
  }
  o.dirty = true;
  if (o.y + o.base < -(h.depth * 0.8 + o.h) || f.t > 5.5) {
    o.state = 2; falling.delete(o); hideObject(o); o.dirty = false;
  }
}

function respawn(h) {
  // Losing a hole costs you a fifth of your size, not the round. Combined with the catch-up band
  // this keeps a swallowed player in the race instead of spiralling.
  h.alive = true; h.invuln = 3.5; h.level = Math.max(3, Math.round(h.level * 0.8)); h.mass = 0;
  h.r = h.targetR = levelRadius(h.level);
  // find a spot away from big holes
  let best = null, bestD = -1;
  for (let k = 0; k < 12; k++) {
    const x = range(-CITY.SPAN * 0.42, CITY.SPAN * 0.42), z = range(-CITY.SPAN * 0.42, CITY.SPAN * 0.42);
    let md = 1e9; for (const o of holes) if (o !== h && o.alive) md = Math.min(md, Math.hypot(o.x - x, o.z - z) - o.r);
    if (md > bestD) { bestD = md; best = [x, z]; }
  }
  h.x = best[0]; h.z = best[1]; h.vx = h.vz = 0;
  events.push({ type: 'respawn', hole: h });
}

export function flushObjectWrites(list) {
  for (const o of list) if (o.dirty && o.state !== 2) writeObject(o);
}
export { falling, leaning };

// Fade buildings standing between the camera and the player's hole (dithered x-ray)
import { objects as _objs } from './objects.js';
const fading = new Set();
export function updateOccluders(p, dt, pitchTan = 0.9) {
  if (p && p.alive) for (const o of _objs) {
    if (o.kind !== 'building' || o.state !== 0) continue;
    const dz = o.z - p.z, dx = Math.abs(o.x - p.x);
    const occ = dx < o.size + p.r * 0.45 && dz > -o.size * 0.6 && dz < o.h / pitchTan + o.size;
    if (occ) { o.fadeT = 1.0; fading.add(o); }
  }
  for (const o of fading) {
    const t = o.fadeT || 0; o.fadeT = 0;
    const f = (o.fade || 0) + (t - (o.fade || 0)) * Math.min(1, dt * 8);
    o.fade = f < 0.01 && t === 0 ? 0 : f;
    for (const part of o.parts) part.pool.setAttr('aFade', part.id, o.state === 0 ? o.fade : 0);
    if (o.fade === 0) fading.delete(o);
  }
}
