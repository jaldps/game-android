// Racer: track-relative bike physics (s along course, u lateral, psi heading vs trail), air/landing/tricks/crash,
// AI brain, and the visual bike + rider posing (IK, lean, pump, tricks, tumble).
import * as THREE from 'three';
import { TUNE } from './config.js';
import { clamp, lerp, damp, smoothstep } from './rng.js';
import { frameAt, trackY, lerpArr, propOffset } from './track.js';
import { heightAt } from './terrain.js';
import { buildBike, buildRider, poseBike, pedalPos, gripPos, aimBone, ik2, RL, BIKE } from './rig.js';

const G = TUNE.G;
const TRICKS = [
  { name: 'SUPERMAN', dur: 0.62, pw: 0.7 },
  { name: 'NO-HANDER', dur: 0.5, pw: 0.5 },
  { name: 'TABLETOP', dur: 0.55, pw: 0.6 },
  { name: 'CAN-CAN', dur: 0.5, pw: 0.5 },
  { name: '360', dur: 0.78, pw: 1.0 },
  { name: 'BACKFLIP', dur: 0.95, pw: 1.4 },
];
export { TRICKS };
const _f = { x: 0, z: 0, y: 0, th: 0, k: 0, bank: 0, w: 0 }, _po = { kind: 0, wall: 0 };
const V = () => new THREE.Vector3();

export class Racer {
  constructor(scene, T, o) {
    this.T = T; this.name = o.name; this.isPlayer = !!o.isPlayer; this.skill = o.skill ?? 1; this.idx = o.idx ?? 0;
    this.kit = o.kit; this.paint = o.paint; this.up = o.up || { speed: 0, grip: 0, armor: 0, boost: 0 };
    this.bike = buildBike(o.paint); this.rider = buildRider(o.kit);
    this.bikeRoot = new THREE.Group(); this.riderRoot = new THREE.Group();
    this.bikeRoot.add(this.bike.mesh); this.riderRoot.add(this.rider.mesh);
    scene.add(this.bikeRoot); scene.add(this.riderRoot);
    this.events = [];
    this.reset(o.s ?? T.start, o.u ?? 0);
    // visual state
    this.spinF = 0; this.spinR = 0; this.crank = 0; this.lean = 0; this.pitch = 0; this.vsteer = 0; this.crouch = 0.4; this.bob = 0; this.landT = 0; this.yawRateS = 0; this.prevPhi = null; this.pumpT = 0;
    this.ai = { tu: 0, kick: Math.random() < 0.65, err: 0, mistake: 0, think: 0 };
    this.world = V(); this.vel = V();
  }
  reset(s, u) {
    this.s = s; this.u = u; this.v = 0; this.psi = 0; this.y = trackY(this.T, s); this.vy = 0; this.air = false; this.airT = 0;
    this.crashT = 0; this.ghostT = 0; this.hp = 100; this.power = 0; this.boostT = 0; this.finished = false; this.finishTime = 0; this.dnf = false;
    this.cp = 0; this.trick = null; this.trickQueue = 0; this.tricks = 0; this.totalAir = 0; this.topSpeed = 0; this.crashes = 0; this.place = 1;
    this.steerIn = 0; this.braking = false; this.pedaling = false; this.jumpBuf = 0; this.lastTape = 0; this.offTrail = false; this.surfaceKind = 0; this.combo = 0;
    this.started = false; this.raceTime = 0; this.splits = [];
  }
  get speedKmh() { return this.v * 3.6 * 1.01; }

  // ------------------------------------------------------------------ ground
  groundAt(s, u) {
    const T = this.T; frameAt(T, s, _f); const tw = _f.w * 0.5;
    const pk = propOffset(T, s, u, _po);
    if (Math.abs(u) <= tw + 0.3 || pk > 0) return _f.y + _f.bank * clamp(u, -tw - 0.5, tw + 0.5) + pk;
    const x = _f.x - Math.cos(_f.th) * u, z = _f.z + Math.sin(_f.th) * u;
    return heightAt(x, z);
  }

  // ------------------------------------------------------------------ simulation
  step(dt, input, race) {
    const T = this.T;
    if (this.finished && !this.isPlayer) input = { steer: 0, brake: this.v > 6, jump: false, boost: false };
    if (this.crashT > 0) { this.updateCrash(dt); return; }
    if (this.ghostT > 0) this.ghostT -= dt;
    frameAt(T, this.s, _f);
    const k = _f.k, tw = _f.w * 0.5, bank = _f.bank;
    const grip = 1 + this.up.grip * 0.06;
    // ---- steering ----
    const st = clamp(input.steer, -1, 1);
    this.steerIn = st; this.braking = !!input.brake && race.go;
    const vs = Math.sqrt((TUNE.latAcc * grip + Math.abs(bank) * 14) / (Math.abs(k) + 1e-4));
    const over = this.v / vs;
    let assist = TUNE.assist * (over < 1 ? 1 : clamp(1 - (over - 1) * 2.0, 0.12, 1));
    if (this.air) assist = Math.max(assist, 0.75);
    const sdot = this.v * Math.cos(this.psi) / (1 + k * this.u);
    const yawCmd = this.air ? 0 : -st * TUNE.yawRate * (0.6 + 0.4 * clamp(this.v / 14, 0, 1)) * (this.braking ? 1.15 : 1);
    this.psi += (yawCmd - (1 - assist) * k * sdot) * dt;
    if (!this.air) this.psi -= this.psi * (Math.abs(st) < 0.1 ? 2.2 : 0.6) * dt;
    this.psi = clamp(this.psi, -0.85, 0.85);
    this.skid = over > 1.05 && !this.air ? clamp((over - 1) * 3, 0, 1) : 0;
    // ---- speed ----
    const gy0 = this.groundAt(this.s + 0.6, this.u), gy1 = this.groundAt(this.s - 0.6, this.u);
    const slope = (gy0 - gy1) / 1.2;
    const dragK = TUNE.drag * (1 - this.up.speed * 0.045) * (this.boostT > 0 ? 1 / (TUNE.boostV * TUNE.boostV) : 1);
    let a = -dragK * this.v * this.v;
    this.offTrail = Math.abs(this.u) > tw + 0.35;
    this.pedaling = false;
    if (!this.air) {
      a += -G * slope * 0.93 - TUNE.roll;
      if (this.offTrail) a -= TUNE.offTrailA * clamp(this.v / 4, 0.2, 1);
      if (this.skid > 0) a -= this.skid * 2.5;
      if (race.go && !this.braking && this.v < TUNE.pedalV + (this.isPlayer ? 0 : 0.5)) { a += TUNE.pedalA * (1 - this.v / (TUNE.pedalV + 2)); this.pedaling = true; }
      if (this.braking) a -= TUNE.brakeA * clamp(this.v / 3, 0.3, 1);
    }
    if (this.boostT > 0) { a += TUNE.boostA; this.boostT -= dt; }
    if (!race.go) { a = 0; this.v = 0; }
    this.v = clamp(this.v + a * dt, 0, 36);
    // ---- integrate planar motion ----
    this.s += sdot * dt; this.u += -this.v * Math.sin(this.psi) * dt;
    // ---- boundaries ----
    const tapeU = tw + 1.25;
    if (race.tapeAt && race.tapeAt(this.s) && Math.abs(this.u) > tapeU) this.bounce(Math.sign(this.u) * tapeU, 0.86, 'tape');
    if (race.walls && Math.abs(this.u) > tw + 0.02) { const hard = Math.abs(this.psi) > 0.42 && this.v > 13 && this.ghostT <= 0; if (hard) { this.crash('wall'); return; } this.bounce(Math.sign(this.u) * (tw + 0.02), 0.82, 'wall'); }
    propOffset(T, this.s, this.u, _po);
    if (_po.wall > 0 && Math.abs(this.u) > _po.wall) this.bounce(Math.sign(this.u) * _po.wall, 0.9, 'rail');
    if (Math.abs(this.u) > tw + 6.5) this.bounce(Math.sign(this.u) * (tw + 6.5), 0.6, 'edge');
    // ---- obstacles ----
    if (this.ghostT <= 0 && !this.air || (this.air && this.y - this.groundAt(this.s, this.u) < 0.6)) {
      const obs = race.obstacles; let lo = 0, hi = obs.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (obs[m].s < this.s - 2) lo = m + 1; else hi = m; }
      for (let i = lo; i < obs.length && obs[i].s < this.s + 2; i++) {
        const o = obs[i]; const ds = o.s - this.s, du = o.u - this.u; const d = Math.hypot(ds, du);
        if (d < o.r + 0.32) {
          if (this.v > 4.5 && this.ghostT <= 0) { this.crash(o.kind); return; }
          this.u -= Math.sign(du || 1) * (o.r + 0.33 - d); this.v *= 0.9;
        }
      }
    }
    // ---- vertical ----
    const gy = this.groundAt(this.s, this.u);
    propOffset(T, this.s, this.u, _po); this.surfaceKind = _po.kind;
    if (!this.air) {
      const vyG = (gy - this.y) / dt;
      if ((vyG < this.vy - G * dt * 1.2 && this.v > 4) || gy < this.y - 0.3) { this.takeoff(); }
      else { this.y = gy; this.vy = clamp(vyG, -25, 25); }
      if (input.jump && race.go && !this.air) {
        const fi = T.FI[Math.floor(this.s)]; const f = fi >= 0 ? T.feats[fi] : null;
        let perfect = false;
        if (f && f.lip !== undefined) { const dl = f.lip - this.s; if (dl > -0.4 && dl < 3.2 && (f.type !== 'kicker' || Math.abs(this.u - f.u0) < f.half + 0.1)) perfect = true; }
        this.vy = Math.max(this.vy, 0) + TUNE.hop + (perfect ? TUNE.pop : 0);
        this.pumpT = 0.25;
        this.takeoff();
        if (perfect) { this.gain(0.5); this.events.push({ t: 'pop' }); } else this.events.push({ t: 'hop' });
      }
    }
    if (this.air) {
      this.vy -= G * dt; this.y += this.vy * dt; this.airT += dt; this.totalAir += dt;
      if (this.trick) { this.trick.t += dt; if (this.trick.t >= this.trick.dur) { this.completeTrick(); } }
      if (input.jump && !this.trick && race.go) this.startTrick(input.trickPick);
      if (this.y <= gy) this.land(gy, slope);
    }
    if (input.boost && this.power >= 1 && race.go && this.boostT <= 0.3) { this.power -= 1; this.boostT = TUNE.boostT; this.events.push({ t: 'boost' }); }
    this.topSpeed = Math.max(this.topSpeed, this.speedKmh);
  }
  bounce(uLim, keep, kind) {
    this.u = uLim; this.psi = -this.psi * 0.3 + Math.sign(uLim) * 0.08; this.v *= keep;
    if (this.lastTape <= 0) { this.events.push({ t: kind }); this.lastTape = 0.4; }
  }
  takeoff() { this.air = true; this.airT = 0; this.events.push({ t: 'air' }); }
  land(gy, slope) {
    this.air = false; const groundVy = this.v * slope; const impact = groundVy - this.vy; this.y = gy;
    if (this.trick) {
      if (this.trick.t < this.trick.dur * 0.86) { this.crash('trick'); return; }
      this.completeTrick();
    }
    this.vy = groundVy;
    this.landT = clamp(impact / 9, 0.25, 1);
    if (impact > 9.5) { this.v *= 0.9; this.events.push({ t: 'hard', impact }); }
    else this.events.push({ t: 'land', impact, air: this.airT });
    if (this.airT > 0.75) { this.gain(0.25); this.events.push({ t: 'bigair', air: this.airT }); }
  }
  startTrick(pick) {
    const air = this.predictAir();
    let list = TRICKS.filter(t => t.name !== 'BACKFLIP' || air > 1.2);
    const tr = pick != null ? TRICKS[pick % TRICKS.length] : list[Math.floor(Math.random() * list.length)];
    this.trick = { ...tr, t: 0 }; this.events.push({ t: 'trickStart', name: tr.name });
  }
  completeTrick() {
    if (!this.trick) return; const tr = this.trick; this.trick = null; this.tricks++; this.combo++;
    this.gain(tr.pw * (1 + this.up.boost * 0.12)); this.events.push({ t: 'trick', name: tr.name, pw: tr.pw });
  }
  gain(p) { this.power = Math.min(5, this.power + p * (1 + this.up.boost * 0.1)); }
  predictAir() {
    // remaining airtime by forward-simulating the ballistic arc over the ground ahead
    let s = this.s, y = this.y, vy = this.vy, t = 0; const sd = this.v * Math.cos(this.psi);
    if (!this.air) vy = Math.max(vy, 0) + TUNE.hop;
    for (let i = 0; i < 150; i++) { const h = 1 / 60; s += sd * h; vy -= G * h; y += vy * h; t += h; if (y <= this.groundAt(s, this.u)) return t; }
    return t;
  }
  crash(kind) {
    this.crashT = 2.1; this.crashes++; this.trick = null; this.combo = 0; this.boostT = 0;
    const dmg = kind === 'trick' ? 28 : 34; this.hp = Math.max(0, this.hp - dmg * (1 - this.up.armor * 0.12));
    this.events.push({ t: 'crash', kind });
    // tumble state: rider & bike get world velocities + spins
    const th = lerpArr(this.T.TH, this.s) + this.psi;
    const fx = Math.sin(th), fz = Math.cos(th); const sp = Math.max(4, this.v);
    this.rag = {
      t: 0,
      rp: this.world.clone().add(new THREE.Vector3(0, 1.0, 0)), rv: new THREE.Vector3(fx * sp * 0.75, 3.2 + Math.random() * 1.5, fz * sp * 0.75),
      rq: this.riderRoot.quaternion.clone(), rw: new THREE.Vector3(6 + Math.random() * 4, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
      bp: this.world.clone().add(new THREE.Vector3(0, 0.4, 0)), bv: new THREE.Vector3(fx * sp * 0.55, 2.0, fz * sp * 0.55),
      bq: this.bikeRoot.quaternion.clone(), bw: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 10, 8 + Math.random() * 4),
      sCrash: this.s,
    };
    this.v = 0; this.air = false;
  }
  updateCrash(dt) {
    const r = this.rag; r.t += dt; this.crashT -= dt;
    const tumble = (p, v, q, w, rad) => {
      v.y -= G * dt; p.addScaledVector(v, dt);
      const gy = heightAt(p.x, p.z) + rad;
      if (p.y < gy) { p.y = gy; if (v.y < 0) v.y = -v.y * 0.35; v.x *= 0.82; v.z *= 0.82; w.multiplyScalar(0.8); }
      const ang = w.length() * dt; if (ang > 1e-5) { _qq.setFromAxisAngle(_ax.copy(w).normalize(), ang); q.premultiply(_qq); }
    };
    tumble(r.rp, r.rv, r.rq, r.rw, 0.25); tumble(r.bp, r.bv, r.bq, r.bw, 0.3);
    if (this.crashT <= 0) {
      if (this.hp <= 0 && this.isPlayer) { this.dnf = true; this.crashT = 0.0001; return; }
      const T = this.T; frameAt(T, r.sCrash, _f);
      this.s = Math.max(T.start, r.sCrash - 1.5); this.u = clamp(this.u, -_f.w * 0.5 + 0.6, _f.w * 0.5 - 0.6);
      if (Math.abs(this.u) > 1.2) this.u *= 0.5;
      this.psi = 0; this.v = 5; this.y = this.groundAt(this.s, this.u); this.vy = 0; this.ghostT = 1.6; this.rag = null; this.crashT = 0; this.prevPhi = null;
      this.events.push({ t: 'respawn' });
    }
  }

  // ------------------------------------------------------------------ AI
  think(dt, race, player) {
    const T = this.T, A = this.ai; const look = 6 + this.v * 0.45;
    frameAt(T, this.s, _f); const tw = _f.w * 0.5;
    let target = lerpArr(T.LINE, this.s + look) * 0.85 + A.err;
    // obstacles ahead
    const obs = race.obstacles;
    for (const o of obs) {
      if (o.s < this.s + 1 || o.s > this.s + 22) continue; if (Math.abs(o.u) > tw + 0.6) continue;
      if (Math.abs(target - o.u) < o.r + 0.75 && A.mistake <= 0) target = o.u + Math.sign(target - o.u || (o.u > 0 ? -1 : 1)) * (o.r + 0.9);
    }
    // kickers: hit them (for power) or avoid
    for (const f of T.feats) if (f.type === 'kicker' && f.s0 > this.s && f.s0 < this.s + 25) { target = A.kick ? f.u0 : (Math.abs(target - f.u0) < f.half + 0.4 ? f.u0 - Math.sign(f.u0 || 1) * (f.half + 0.6) : target); }
    // racers ahead: pass on the other side
    for (const o of race.racers) if (o !== this && o.s > this.s && o.s < this.s + 4 && Math.abs(o.u - this.u) < 1.0) target = o.u + (o.u > 0 ? -1.3 : 1.3);
    target = clamp(target, -tw + 0.45, tw - 0.45);
    // speed target
    let skill = this.skill * race.rivalSkill;
    if (player && !this.isPlayer) { const gap = this.s - player.s; if (gap > 35) skill *= 0.93; else if (gap < -50) skill *= 1.06; }
    let vt = Math.min(lerpArr(T.VS, this.s + look * 0.6), lerpArr(T.VS, this.s + 3)) * (0.88 + 0.12 * skill) * (1 + this.up.grip * 0.03);
    const brake = this.v > vt * 1.03;
    // steering: lateral velocity toward target
    const uErr = target - this.u;
    const latV = clamp(uErr * 1.6, -4, 4);
    const psiDes = -Math.asin(clamp(latV / Math.max(this.v, 3), -0.6, 0.6));
    const k = _f.k, sdot = this.v;
    const vs = Math.sqrt((TUNE.latAcc + Math.abs(_f.bank) * 14) / (Math.abs(k) + 1e-4)); const over = this.v / vs;
    const assist = TUNE.assist * (over < 1 ? 1 : clamp(1 - (over - 1) * 2.0, 0.12, 1));
    const ff = -(1 - assist) * k * sdot;
    let steer = -((psiDes - this.psi) * 5 - ff) / TUNE.yawRate;
    steer = clamp(steer, -1, 1);
    // jumps
    let jump = false;
    const fi = T.FI[Math.floor(this.s + 1)]; const f = fi >= 0 ? T.feats[fi] : null;
    if (!this.air && f && f.lip !== undefined) { const dl = f.lip - this.s; if (dl > 0.2 && dl < 1.4 && Math.random() < 0.5 * skill * dt * 60 * 0.2) jump = true; }
    if (this.air && !this.trick && this.airT > 0.08) { const rem = this.predictAir(); if (rem > 0.7 && Math.random() < 0.06 * skill) jump = true; }
    // occasional mistakes
    A.mistake -= dt; A.think -= dt;
    if (A.think <= 0) { A.think = 1.5 + Math.random() * 2; A.err = (Math.random() - 0.5) * 0.8; if (Math.random() < (1.08 - skill) * 0.25) A.mistake = 1.2; if (Math.random() < 0.3) A.kick = Math.random() < 0.65; }
    const boost = this.power >= 1 && Math.abs(lerpArr(T.K, this.s + 25)) < 0.02 && this.v < vt * 0.92 && !this.air && Math.random() < 0.02;
    return { steer, brake, jump, boost, trickPick: null };
  }

  // ------------------------------------------------------------------ visuals
  pose(dt, time) {
    const T = this.T;
    if (this.rag) { this.poseCrash(dt, time); return; }
    frameAt(T, this.s, _f);
    const th = _f.th, phi = th + this.psi;
    const x = _f.x - Math.cos(th) * this.u, z = _f.z + Math.sin(th) * this.u;
    this.world.set(x, this.y, z);
    // heading rate -> lean
    if (this.prevPhi === null) this.prevPhi = phi;
    let dphi = phi - this.prevPhi; this.prevPhi = phi;
    const yawRate = dt > 0 ? dphi / dt : 0; this.yawRateS = damp(this.yawRateS, yawRate, 8, dt);
    let leanT = this.air ? 0 : -Math.atan(clamp(this.v * this.yawRateS / G, -1.2, 1.2)) * 0.85;
    leanT += -_f.bank * 0.5 * Math.sign(this.yawRateS || 0) * 0;
    this.lean = damp(this.lean, leanT, 7, dt);
    // pitch from wheel contacts or trajectory
    let pitchT;
    if (!this.air) { const yr = this.groundAt(this.s - 0.62, this.u), yf = this.groundAt(this.s + 0.66, this.u); pitchT = Math.atan2(yr - yf, 1.28); }
    else { const traj = Math.atan2(-this.vy, Math.max(this.v, 1)); const yr = this.groundAt(this.s + 3, this.u), yf = this.groundAt(this.s + 5, this.u); const landP = Math.atan2(yr - yf, 2); pitchT = lerp(traj * 0.6, landP, smoothstep(0, 0.5, -this.vy / 6)); }
    this.pitch = damp(this.pitch, pitchT, this.air ? 4 : 14, dt);
    // root transform
    const root = this.bikeRoot; root.position.set(x, this.y, z);
    root.rotation.set(0, 0, 0); root.quaternion.setFromEuler(_e.set(this.pitch, phi, this.lean, 'YXZ'));
    // tricks: extra rotations
    let tw = 0, trick = this.trick;
    if (trick) {
      const q = clamp(trick.t / trick.dur, 0, 1); tw = Math.sin(q * Math.PI); const e = q * q * (3 - 2 * q);
      if (trick.name === '360') _qq.setFromAxisAngle(_ay, e * Math.PI * 2);
      else if (trick.name === 'BACKFLIP') _qq.setFromAxisAngle(_axX, -e * Math.PI * 2);
      else if (trick.name === 'TABLETOP') _qq.setFromEuler(_e.set(0, 0.5 * tw, -1.15 * tw));
      else _qq.identity();
      root.quaternion.multiply(_qq);
      if (trick.name === 'BACKFLIP' || trick.name === '360') root.position.y += 0.4 * tw;
    }
    this.riderRoot.position.copy(root.position); this.riderRoot.quaternion.copy(root.quaternion);
    // wheels, cranks, steer
    const R = BIKE.wheelR;
    this.spinF += this.v / R * dt * (this.braking && !this.air ? 0.97 : 1); this.spinR += this.v / R * dt * (this.braking && !this.air ? 0.6 : 1);
    if (this.pedaling) this.crank += dt * (5 + this.v * 0.9);
    else { const target = Math.round((this.crank) / Math.PI) * Math.PI; this.crank = damp(this.crank, target, 6, dt); }
    this.vsteer = damp(this.vsteer, clamp(-this.steerIn * 0.22 + this.yawRateS * 0.08, -0.45, 0.45) * (this.air ? 0.3 : 1) + (trick && trick.name === 'TABLETOP' ? 0.5 * tw : 0), 10, dt);
    poseBike(this.bike, this.vsteer, -this.spinF, -this.spinR, this.crank);
    // crouch / pump
    this.landT = Math.max(0, this.landT - dt * 2.2); this.pumpT = Math.max(0, this.pumpT - dt);
    let cT = 0.42 + clamp((this.v - 8) / 20, 0, 0.35) + (this.braking ? 0.1 : 0) - (this.pedaling ? 0.12 : 0);
    const fi = T.FI[Math.floor(this.s)]; const f = fi >= 0 ? T.feats[fi] : null;
    if (!this.air && f && f.lip !== undefined && f.lip - this.s < 4 && f.lip - this.s > 0) cT += 0.35 * (1 - (f.lip - this.s) / 4); // load before lip
    if (this.pumpT > 0) cT -= 0.5;
    if (this.air) cT = 0.2 + 0.4 * smoothstep(0, -6, this.vy);
    cT += this.landT * 0.6;
    this.crouch = damp(this.crouch, clamp(cT, 0, 1.1), 10, dt);
    this.bob = this.pedaling ? Math.sin(this.crank * 2) * 0.02 : 0;
    this.poseRider(trick, tw, time);
    // ghost blink
    const vis = this.ghostT > 0 ? (Math.floor(time * 14) % 2 === 0) : true;
    this.bikeRoot.visible = vis; this.riderRoot.visible = vis;
  }
  poseRider(trick, tw, time) {
    const b = this.rider.bones, c = this.crouch;
    const pel = _pel.set(-this.lean * 0.12, 1.07 - 0.18 * c + this.bob, -0.31 - 0.07 * c);
    let ta = 0.72 + 0.28 * c; // torso forward angle
    const name = trick ? trick.name : '';
    if (name === 'SUPERMAN') { pel.y += 0.16 * tw; pel.z -= 0.22 * tw; ta += 0.45 * tw; }
    const tdir = _td.set(0, Math.cos(ta), Math.sin(ta));
    const neck = _neck.copy(pel).addScaledVector(tdir, RL.torso);
    aimBone(b[0], pel, _tmp.copy(pel).add(tdir), _fwd);
    aimBone(b[1], pel, neck, _fwd);
    _tmp.set(0, 1, 0.45 - 0.3 * c).normalize().add(neck);
    aimBone(b[2], neck, _tmp, _fwd2.set(0, -0.2, 1));
    // arms
    for (const side of [-1, 1]) {
      const sh = _sh.copy(neck).add(_tmp2.set(side * 0.19, -0.065, -0.03));
      const grip = gripPos(this.vsteer, side, _grip);
      let wrist = _wr.copy(grip).add(_tmp2.set(-side * 0.02, -0.01, -0.05));
      if (name === 'NO-HANDER') wrist.lerp(_tmp2.copy(sh).add(_tmp3.set(side * 0.52, 0.28, -0.08)), tw);
      const elbow = ik2(sh, wrist, RL.uarm, RL.farm, _tmp3.set(side * 1, 0.15, -0.45), _el);
      const ub = side < 0 ? 3 : 6;
      aimBone(b[ub], sh, elbow, _fwd); aimBone(b[ub + 1], elbow, wrist, _fwd);
      aimBone(b[ub + 2], wrist, _tmp.copy(wrist).lerp(grip, 1).addScaledVector(_tmp2.copy(grip).sub(wrist).normalize(), 0.02), _tmp3.set(0, -0.3, 1));
    }
    // legs
    for (const side of [-1, 1]) {
      const hip = _hip.copy(pel).add(_tmp2.set(side * 0.1, -0.04, 0));
      const ped = pedalPos(this.crank, side, _ped);
      let ankle = _an.copy(ped).add(_tmp2.set(0, 0.075, -0.075));
      if (name === 'SUPERMAN') ankle.lerp(_tmp2.copy(pel).add(_tmp3.set(side * 0.13, 0.02, -0.82)), tw);
      if (name === 'CAN-CAN' && side < 0) ankle.lerp(_tmp2.copy(pel).add(_tmp3.set(0.5, -0.3, 0.32)), tw);
      const knee = ik2(hip, ankle, RL.thigh, RL.shin, _tmp3.set(side * 0.3, 0.15, 1), _kn);
      const tb = side < 0 ? 9 : 12;
      aimBone(b[tb], hip, knee, _fwd); aimBone(b[tb + 1], knee, ankle, _fwd);
      aimBone(b[tb + 2], ankle, _tmp.copy(ankle).add(_upV), _fwd3.set(0, -0.12, 1));
    }
  }
  poseCrash(dt, time) {
    const r = this.rag;
    this.bikeRoot.position.copy(r.bp).y -= 0.3; this.bikeRoot.quaternion.copy(r.bq);
    this.riderRoot.position.copy(r.rp).y -= 0.95; this.riderRoot.quaternion.copy(r.rq);
    this.world.copy(r.rp);
    this.spinF += dt * 8; this.spinR += dt * 6;
    poseBike(this.bike, Math.sin(time * 5) * 0.4, -this.spinF, -this.spinR, this.crank);
    // flailing sprawl pose
    const b = this.rider.bones; const t = r.t; const fl = Math.max(0, 1 - t * 0.5);
    const pel = _pel.set(0, 0.95, 0); const neck = _neck.set(0, 1.47, 0.05 + Math.sin(t * 9) * 0.1 * fl);
    aimBone(b[0], pel, _tmp.set(0, 2, 0), _fwd); aimBone(b[1], pel, neck, _fwd); aimBone(b[2], neck, _tmp.set(Math.sin(t * 7) * 0.3 * fl, 2.47, 0.3), _fwd);
    for (const side of [-1, 1]) {
      const sh = _sh.copy(neck).add(_tmp2.set(side * 0.19, -0.06, 0));
      const w = _wr.copy(sh).add(_tmp2.set(side * (0.35 + 0.15 * Math.sin(t * 11 + side)), 0.2 * Math.sin(t * 13 + side * 2) * fl + 0.1, 0.25 * Math.cos(t * 10 + side)));
      const el = ik2(sh, w, RL.uarm, RL.farm, _tmp3.set(side, -0.5, -0.3), _el); const ub = side < 0 ? 3 : 6;
      aimBone(b[ub], sh, el, _fwd); aimBone(b[ub + 1], el, w, _fwd); aimBone(b[ub + 2], w, _tmp.copy(w).add(_tmp2.set(side * 0.1, 0, 0)), _fwd);
      const hip = _hip.copy(pel).add(_tmp2.set(side * 0.1, -0.04, 0));
      const an = _an.copy(hip).add(_tmp2.set(side * 0.25, -0.75 + 0.15 * Math.sin(t * 12 + side) * fl, 0.25 * Math.sin(t * 9 + side * 3) * fl));
      const kn = ik2(hip, an, RL.thigh, RL.shin, _tmp3.set(side * 0.3, 0, 1), _kn); const tb = side < 0 ? 9 : 12;
      aimBone(b[tb], hip, kn, _fwd); aimBone(b[tb + 1], kn, an, _fwd); aimBone(b[tb + 2], an, _tmp.copy(an).add(_upV), _fwd);
    }
    this.bikeRoot.visible = this.riderRoot.visible = true;
  }
  dispose(scene) {
    scene.remove(this.bikeRoot); scene.remove(this.riderRoot);
    for (const m of [this.bike, this.rider]) { m.mesh.geometry.dispose(); m.mats.forEach(x => { x.map?.dispose(); x.dispose(); }); m.mesh.skeleton.dispose(); }
  }
}
const _qq = new THREE.Quaternion(), _ax = new THREE.Vector3(), _ay = new THREE.Vector3(0, 1, 0), _axX = new THREE.Vector3(1, 0, 0), _e = new THREE.Euler();
const _pel = V(), _td = V(), _neck = V(), _tmp = V(), _tmp2 = V(), _tmp3 = V(), _fwd = new THREE.Vector3(0, 0, 1), _fwd2 = V(), _fwd3 = V(), _sh = V(), _grip = V(), _wr = V(), _el = V(), _hip = V(), _ped = V(), _an = V(), _kn = V(), _upV = new THREE.Vector3(0, 1, 0);
