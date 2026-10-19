// Layered 2D cartoon character rig: cel shading + rim light, expressive faces, procedural animation.
import { TAU, clamp, lerp, mix, shade, tint, cel, rotL, roundRect, star, easeOut } from './util.js';

const DEF_LIGHT = { L: { x: -0.55, y: -0.83 }, amb: '#ffffff', ambAmt: 0, shadow: '#4b3a7a', shadowAmt: 0.42, rim: '#fff3d6', rimAmt: 0.75, outline: '#21152c' };

// ---------- path helpers ----------
function capsule(c, x0, y0, x1, y1, r0, r1, dx = 0, dy = 0) {
  x0 += dx; x1 += dx; y0 += dy; y1 += dy;
  const a = Math.atan2(y1 - y0, x1 - x0), n = Math.PI / 2;
  c.moveTo(x0 + Math.cos(a + n) * r0, y0 + Math.sin(a + n) * r0);
  c.arc(x0, y0, r0, a + n, a - n);
  c.lineTo(x1 + Math.cos(a - n) * r1, y1 + Math.sin(a - n) * r1);
  c.arc(x1, y1, r1, a - n, a + n);
  c.closePath();
}
const circ = (x, y, r) => (c, dx, dy) => { c.moveTo(x + dx + r, y + dy); c.arc(x + dx, y + dy, r, 0, TAU); };
const ell = (x, y, rx, ry, rot = 0) => (c, dx, dy) => { c.moveTo(x + dx + Math.cos(rot) * rx, y + dy + Math.sin(rot) * rx); c.ellipse(x + dx, y + dy, rx, ry, rot, 0, TAU); };

function ik(sx, sy, hx, hy, l1, l2, bendSign) {
  let dx = hx - sx, dy = hy - sy; let d = Math.hypot(dx, dy); const maxd = l1 + l2 - 0.01;
  if (d > maxd) { hx = sx + dx / d * maxd; hy = sy + dy / d * maxd; dx = hx - sx; dy = hy - sy; d = maxd; }
  d = Math.max(d, 1e-3);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx) + a * bendSign;
  return { ex: sx + Math.cos(base) * l1, ey: sy + Math.sin(base) * l1, hx, hy };
}

// ---------- arrows (shared with flight + stuck rendering) ----------
export function drawArrow(c, len, from, look, scale = 1) {
  // origin at tip, shaft toward -x. 'from' hides first N units (embedded part)
  const ol = look.outline || '#21152c';
  c.lineCap = 'round';
  const x0 = -Math.max(from, 0), x1 = -len;
  c.strokeStyle = ol; c.lineWidth = 4.2 * scale; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x1, 0); c.stroke();
  c.strokeStyle = look.shaft || '#e7c48a'; c.lineWidth = 2.2 * scale; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x1, 0); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 0.8 * scale; c.beginPath(); c.moveTo(x0 - 2, -0.6 * scale); c.lineTo(x1 + 8, -0.6 * scale); c.stroke();
  // fletching
  const fx = -len + 3, fl = 15 * scale;
  c.fillStyle = look.fletch || '#e8423f'; c.strokeStyle = ol; c.lineWidth = 1.6 * scale; c.lineJoin = 'round';
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(fx + fl, 0); c.quadraticCurveTo(fx + fl * 0.5, s * 7 * scale, fx - 2, s * 8 * scale); c.lineTo(fx + 2, 0); c.closePath(); c.fill(); c.stroke(); }
  c.fillStyle = look.fletch2 || '#ffffff'; c.beginPath(); c.moveTo(fx + fl * 0.9, 0); c.quadraticCurveTo(fx + fl * 0.4, -2.6 * scale, fx, -3.2 * scale); c.lineTo(fx + 3, 0); c.closePath(); c.fill();
  // nock
  c.fillStyle = ol; c.fillRect(x1 - 2, -1.6 * scale, 3, 3.2 * scale);
  if (from <= 0) { // arrowhead
    c.beginPath(); c.moveTo(4 * scale, 0); c.lineTo(-9 * scale, -5 * scale); c.lineTo(-6 * scale, 0); c.lineTo(-9 * scale, 5 * scale); c.closePath();
    c.fillStyle = '#c9d3df'; c.fill(); c.strokeStyle = ol; c.lineWidth = 1.6 * scale; c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(3 * scale, -0.3); c.lineTo(-7 * scale, -3.6 * scale); c.lineTo(-5 * scale, -0.6); c.closePath(); c.fill();
  }
}

// ---------- the fighter ----------
export class Fighter {
  constructor(def, bow, side, opts = {}) {
    this.def = def; this.bow = bow; this.side = side; this.face = side < 0 ? 1 : -1;
    this.S = opts.scale || 1; this.x = 0; this.y = 0;
    this.maxHp = opts.hp || 100; this.hp = this.maxHp; this.hpShown = this.hp;
    this.t = Math.random() * 10; this.mode = 'idle'; this.modeT = 0;
    this.aim = 0.6; this.drawAmt = 0; this.aimBlend = 0; this.hasArrow = true;
    this.lean = 0; this.leanV = 0; this.squash = 0; this.squashV = 0;
    this.hitT = 9; this.dizzy = 0; this.blinkT = 2; this.topple = 0; this.toppleV = 0;
    this.look = { x: 1, y: 0 }; this.stuck = []; this.headTilt = 0; this.jump = 0;
    this.capeSway = 0; this.wind = 0; this.recoil = 0;
    this.setLight(DEF_LIGHT);
    this.arrowLook = { shaft: '#ecd09a', fletch: def.shirt, fletch2: '#ffffff', outline: '#21152c' };
  }
  setLight(l) {
    this.light = l; this.pc = new Map();
    this.ol = l.outline || '#21152c';
  }
  P(c) { // cached cel palette for a base color under current arena lighting
    let p = this.pc.get(c); if (p) return p;
    const l = this.light, b = tint(c, l.amb, l.ambAmt);
    p = { base: b, shadow: mix(mix(b, l.shadow, l.shadowAmt), '#000000', 0.08), rim: mix(b, l.rim, l.rimAmt), hi: mix(b, '#ffffff', 0.35) };
    this.pc.set(c, p); return p;
  }
  setMode(m) { if (this.mode !== m) { this.mode = m; this.modeT = 0; } }
  hit(part, dirX, strength) {
    this.hitT = 0; this.leanV += dirX * this.face * (part === 'head' ? 9 : 6) * strength; this.squashV -= 6 * strength;
    if (part === 'head') this.dizzy = 2.6;
  }

  update(dt) {
    this.t += dt; this.modeT += dt; this.hitT += dt; this.dizzy = Math.max(0, this.dizzy - dt);
    // springs
    const k = 60, d = 7;
    this.leanV += (-k * this.lean - d * this.leanV) * dt; this.lean += this.leanV * dt; this.lean = clamp(this.lean, -0.5, 0.5);
    this.squashV += (-120 * this.squash - 10 * this.squashV) * dt; this.squash += this.squashV * dt;
    this.recoil = Math.max(0, this.recoil - dt * 3);
    const aiming = this.mode === 'aim';
    this.aimBlend = lerp(this.aimBlend, aiming ? 1 : 0, 1 - Math.exp(-12 * dt));
    if (!aiming) this.drawAmt = lerp(this.drawAmt, 0, 1 - Math.exp(-14 * dt));
    this.blinkT -= dt; if (this.blinkT < -0.13) this.blinkT = 2 + Math.random() * 3.5;
    if (this.mode === 'dead') {
      // fall backwards with a bounce
      const target = -1.62;
      this.toppleV += (target - this.topple) * 70 * dt - this.toppleV * 4 * dt; this.topple += this.toppleV * dt;
      if (this.topple < target) { this.topple = target; this.toppleV = -this.toppleV * 0.3; }
    }
    this.jump = this.mode === 'victory' ? Math.abs(Math.sin(this.modeT * 5.2)) * 22 * Math.min(1, this.modeT * 2) : 0;
    this.hpShown = lerp(this.hpShown, this.hp, 1 - Math.exp(-3 * dt));
    this.capeSway = Math.sin(this.t * 2.1) * 0.5 + this.wind * 0.8;
  }

  // ---- geometry in local (facing-right, y-down, feet at origin) ----
  geo() {
    const d = this.def, R = d.head.r, b = Math.sin(this.t * 2.3);
    const legLen = d.legLen, bw = d.body.w, bh = d.body.h;
    const sq = clamp(this.squash, -0.25, 0.25);
    const hipY = -legLen * (1 + sq * 0.4);
    const shY = hipY - bh * (1 + sq) - b * 1.1 * (1 - this.aimBlend * 0.6);
    const aimLean = this.aimBlend * clamp(this.aim, -0.4, 1.2) * 4;
    const hx = 2 + aimLean * 0.6, hy = shY - R * 0.8 - b * 0.5;
    return { R, legLen, bw, bh, hipY, shY, hx, hy, breath: b };
  }
  rootAngle() { return this.lean + this.topple; }
  toWorld(lx, ly) {
    const a = this.rootAngle(), c = Math.cos(a), s = Math.sin(a), X = this.face * this.S * lx, Y = this.S * ly;
    return { x: this.x + X * c - Y * s, y: this.y - this.jump + X * s + Y * c };
  }
  toLocal(wx, wy) {
    const a = -this.rootAngle(), c = Math.cos(a), s = Math.sin(a), X = wx - this.x, Y = wy - (this.y - this.jump);
    return { x: (X * c - Y * s) / (this.face * this.S), y: (X * s + Y * c) / this.S };
  }
  hitShapes() {
    const g = this.geo(), d = this.def;
    const head = this.toWorld(g.hx, g.hy), torso = this.toWorld(d.body.belly * 6, (g.hipY + g.shY) / 2), leg = this.toWorld(0, g.hipY * 0.5);
    return { head: { x: head.x, y: head.y, r: g.R * 1.02 * this.S }, torso: { x: torso.x, y: torso.y, rx: g.bw * 0.6 * this.S, ry: g.bh * 0.62 * this.S },
      legs: { x: leg.x, y: leg.y, rx: 17 * this.S, ry: -g.hipY * 0.55 * this.S }, top: this.toWorld(g.hx, g.hy - g.R * 1.6) };
  }
  /** test a world point; returns part or null */
  testPoint(px, py) {
    const h = this.hitShapes();
    const inE = (e) => { const dx = (px - e.x) / e.rx, dy = (py - e.y) / e.ry; return dx * dx + dy * dy <= 1; };
    if ((px - h.head.x) ** 2 + (py - h.head.y) ** 2 <= h.head.r ** 2) return 'head';
    if (inE(h.torso)) return 'torso';
    if (inE(h.legs)) return 'legs';
    // bow arm when aiming / limbs
    return null;
  }
  addStuck(part, wx, wy, ang) {
    const l = this.toLocal(wx, wy), g = this.geo();
    // world angle -> local angle
    let la = ang - this.rootAngle(); if (this.face < 0) la = Math.PI - la;
    const s = { part, x: l.x, y: l.y, a: la, wob: 1 };
    if (part === 'head') { s.x -= g.hx; s.y -= g.hy; const c = Math.cos(-this.headTilt), sn = Math.sin(-this.headTilt); const x = s.x * c - s.y * sn, y = s.x * sn + s.y * c; s.x = x; s.y = y; s.a -= this.headTilt; }
    this.stuck.push(s); if (this.stuck.length > 9) this.stuck.shift();
  }
  /** world position of the nocked arrow tip + direction, for launching */
  launchPoint() {
    const p = this.pose(this.geo());
    const dir = this.aim, c = Math.cos(dir), s = -Math.sin(dir);
    const tip = this.toWorld(p.hand.x + c * 30, p.hand.y + s * 30);
    return { x: tip.x, y: tip.y };
  }

  pose(g) {
    const ab = this.aimBlend, d = this.def;
    const victory = this.mode === 'victory', dead = this.mode === 'dead';
    let aim = lerp(-1.0 + Math.sin(this.t * 2.3) * 0.04, this.aim, ab);
    if (victory) aim = 1.25 + Math.sin(this.modeT * 5.2) * 0.15;
    if (dead) aim = -1.2;
    const reach = lerp(30, 45, ab) + (victory ? 6 : 0);
    const bsh = { x: 7, y: g.shY + 10 }, dsh = { x: -3, y: g.shY + 11 };
    const ca = Math.cos(aim), sa = -Math.sin(aim);
    const hand = { x: bsh.x + ca * reach, y: bsh.y + sa * reach };
    const bowLen = this.bow.long ? 50 : 42;
    const bend = 8 + this.drawAmt * 9;
    const pull = 7 + this.drawAmt * 36;
    let dh;
    if (ab > 0.02 && !victory && !dead) {
      const sx = hand.x - ca * (bend + pull), sy = hand.y - sa * (bend + pull);
      const rest = { x: -2, y: g.hipY - 4 };
      dh = { x: lerp(rest.x, sx, ab), y: lerp(rest.y, sy, ab) };
    } else if (victory) { dh = { x: 14, y: g.shY - 4 + Math.sin(this.modeT * 10) * 4 }; }
    else dh = { x: -3 + Math.sin(this.t * 2.3) * 0.6, y: g.hipY - 3 };
    const dIK = ik(dsh.x, dsh.y, dh.x, dh.y, 21, 21, ab > 0.5 ? -1 : 1);
    const bIK = ik(bsh.x, bsh.y, hand.x, hand.y, 23.5, 23.5, 1);
    return { aim, hand: { x: bIK.hx, y: bIK.hy }, belbow: { x: bIK.ex, y: bIK.ey }, bsh, dsh, dhand: { x: dIK.hx, y: dIK.hy }, delbow: { x: dIK.ex, y: dIK.ey }, bowLen, bend, pull, ca, sa };
  }

  expression() {
    if (this.mode === 'dead') return 'ko';
    if (this.mode === 'victory') return 'joy';
    if (this.hitT < 0.9) return this.dizzy > 0 ? 'dizzy' : 'ouch';
    if (this.dizzy > 0) return 'dizzy';
    if (this.mode === 'aim') return 'aim';
    if (this.mode === 'taunt') return 'joy';
    if (this.hp < this.maxHp * 0.35) return 'worried';
    return 'idle';
  }

  // ---------------- drawing ----------------
  draw(c) {
    const g = this.geo(), p = this.pose(g), d = this.def, ol = this.ol;
    const a = this.rootAngle();
    // contact shadow (world-space, not rotated)
    c.save();
    c.translate(this.x, this.y);
    const sh = 1 - Math.min(1, this.jump / 60);
    const shw = (d.body.w * 0.9 + 18) * this.S * (this.mode === 'dead' ? 1.9 : 1) * sh;
    const grd = c.createRadialGradient(0, 0, 1, 0, 0, shw);
    grd.addColorStop(0, 'rgba(10,6,20,.45)'); grd.addColorStop(1, 'rgba(10,6,20,0)');
    c.fillStyle = grd; c.beginPath(); c.ellipse(this.mode === 'dead' ? -this.face * 40 * this.S : 0, 2, shw, shw * 0.22, 0, 0, TAU); c.fill();
    c.restore();

    c.save();
    c.translate(this.x, this.y - this.jump); c.rotate(a); c.scale(this.face * this.S, this.S);
    const r = rotL({ x: this.light.L.x, y: this.light.L.y }, a);
    const L = { x: this.face * r.x, y: r.y };
    this.Lc = L;
    c.lineJoin = 'round'; c.lineCap = 'round';

    this.drawBackHair(c, g, L, 'cape');
    // back leg
    this.drawLeg(c, g, L, -1);
    // back arm (bow arm) is behind torso when idle, in front when aiming: draw bow arm behind for depth
    this.drawTorso(c, g, L);
    this.drawStuck(c, 'torso');
    this.drawLeg(c, g, L, 1);
    this.drawStuck(c, 'legs');
    if (d.parrot) this.drawParrot(c, g, L);
    // head
    const tilt = (this.aimBlend * clamp(this.aim, -0.5, 1.0) * -0.22) + Math.sin(this.t * 2.3) * 0.02 + this.lean * 0.6 + (this.hitT < 0.5 ? Math.sin(this.hitT * 30) * 0.12 * (1 - this.hitT * 2) : 0) + (this.mode === 'dead' ? 0.3 : 0);
    this.headTilt = tilt;
    c.save(); c.translate(g.hx, g.hy); c.rotate(tilt);
    const LH = rotL(L, tilt);
    this.drawHead(c, g.R, LH, this.expression());
    this.drawStuck(c, 'head');
    c.restore();
    // bow arm, bow, string, arrow, draw arm
    this.drawArms(c, g, p, L);
    c.restore();

    if (this.dizzy > 0 && this.mode !== 'dead') this.drawDizzy(c);
  }

  drawStuck(c, part) {
    for (const s of this.stuck) {
      if (s.part !== part) continue;
      s.wob = Math.max(0, s.wob - 0.03);
      c.save(); c.translate(s.x, s.y); c.rotate(s.a + Math.sin(this.t * 40) * 0.08 * s.wob);
      // little dent
      c.fillStyle = 'rgba(30,15,30,.35)'; c.beginPath(); c.ellipse(0, 0, 2.2, 4, 0, 0, TAU); c.fill();
      drawArrow(c, 58, 2, this.arrowLook, 1);
      c.restore();
    }
  }

  drawDizzy(c) {
    const h = this.hitShapes(), top = h.top; const n = 3;
    for (let i = 0; i < n; i++) {
      const a = this.t * 4 + i * TAU / n; const x = top.x + Math.cos(a) * 30 * this.S, y = top.y + 8 + Math.sin(a) * 9 * this.S;
      const front = Math.sin(a) > 0; c.globalAlpha = Math.min(1, this.dizzy) * (front ? 1 : 0.6);
      c.beginPath(); star(c, x, y, 8, 3.6, 5, a); c.fillStyle = '#ffd93b'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#7a4a10'; c.stroke();
    }
    c.globalAlpha = 1;
  }

  drawLeg(c, g, L, s) {
    const d = this.def, ol = this.ol, P = this.P.bind(this);
    const hipX = s > 0 ? 6 : -6, footX = s > 0 ? 13 : -11;
    const kneeOut = this.mode === 'victory' ? Math.sin(this.modeT * 10.4) * 3 : 0;
    const w = d.furry ? 9 : 7.5;
    const pc = P(s > 0 ? d.pants : shade(d.pants, -0.18));
    const hy = g.hipY + 2, fy = -7;
    if (d.robe && s < 0) return; // robe hides back leg
    cel(c, (cc, dx, dy) => capsule(cc, hipX, hy, footX + kneeOut, fy, w, w * 0.85, dx, dy), { ...pc, L, size: 12, outline: ol, lw: 3.2, shadowAmt: 0.35 });
    // boot
    const bc = P(s > 0 ? d.boot : shade(d.boot, -0.2));
    const bx = footX + kneeOut;
    cel(c, (cc, dx, dy) => { cc.moveTo(bx - 8 + dx, -1 + dy); cc.lineTo(bx - 8 + dx, -11 + dy); cc.quadraticCurveTo(bx + 1 + dx, -15 + dy, bx + 6 + dx, -8 + dy); cc.quadraticCurveTo(bx + 15 + dx, -7 + dy, bx + 15 + dx, -2 + dy); cc.quadraticCurveTo(bx + 15 + dx, 1 + dy, bx + 11 + dx, 1 + dy); cc.lineTo(bx - 6 + dx, 1 + dy); cc.closePath(); },
      { ...bc, L, size: 10, outline: ol, lw: 3, gloss: d.furry ? null : bc.hi });
    if (d.furry) { c.strokeStyle = ol; c.lineWidth = 1.5; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(bx + 6 + i * 3, 0); c.lineTo(bx + 7 + i * 3, -4); c.stroke(); } }
  }

  torsoTrace(g, ext = 0) {
    const d = this.def, bw = g.bw, bh = g.bh, bl = d.body.belly * bw * 0.55;
    const yt = g.shY, yb = g.hipY + 6 + ext;
    return (c, dx, dy) => {
      c.moveTo(-bw * 0.4 + dx, yt + 3 + dy);
      c.quadraticCurveTo(dx + 2, yt - 6 + dy, bw * 0.42 + dx, yt + 3 + dy);
      c.bezierCurveTo(bw * 0.58 + bl + dx, yt + bh * 0.35 + dy, bw * 0.6 + bl + dx, yb - bh * 0.18 + dy, bw * 0.46 + dx, yb + dy);
      c.quadraticCurveTo(dx, yb + 6 + dy, -bw * 0.48 + dx, yb + dy);
      c.bezierCurveTo(-bw * 0.62 + dx, yb - bh * 0.3 + dy, -bw * 0.56 + dx, yt + bh * 0.25 + dy, -bw * 0.4 + dx, yt + 3 + dy);
      c.closePath();
    };
  }

  drawTorso(c, g, L) {
    const d = this.def, ol = this.ol, P = this.P.bind(this);
    const sP = P(d.shirt);
    if (d.robe) { // long royal robe covers legs
      const rt = this.torsoTrace(g, -g.hipY - 12);
      cel(c, rt, { ...P(d.shirt), L, size: 26, outline: ol, lw: 3.4 });
      // ermine trim
      const yb = -6;
      c.save(); c.beginPath(); rt(c, 0, 0); c.clip();
      c.fillStyle = P(d.shirt2).base; c.fillRect(-g.bw, yb - 9, g.bw * 2.4, 14);
      c.fillRect(g.bw * 0.18, g.shY, 9, -g.shY);
      c.fillStyle = '#22182a'; for (let i = -3; i < 4; i++) { c.beginPath(); c.ellipse(i * 9 + 2, yb - 3, 1.4, 2.8, 0, 0, TAU); c.fill(); }
      for (let j = 0; j < 5; j++) { c.beginPath(); c.ellipse(g.bw * 0.18 + 4.5, g.shY + 8 + j * 12, 1.3, 2.6, 0, 0, TAU); c.fill(); }
      c.restore();
      c.beginPath(); rt(c, 0, 0); c.lineWidth = 3.4; c.strokeStyle = ol; c.stroke();
      // ermine collar
      cel(c, (cc, dx, dy) => { cc.moveTo(-g.bw * 0.5 + dx, g.shY + 6 + dy); cc.quadraticCurveTo(dx, g.shY + 18 + dy, g.bw * 0.55 + dx, g.shY + 4 + dy); cc.quadraticCurveTo(dx, g.shY - 8 + dy, -g.bw * 0.5 + dx, g.shY + 6 + dy); cc.closePath(); }, { ...P(d.shirt2), L, size: 10, outline: ol, lw: 2.6 });
      return;
    }
    if (d.coat) { // lab coat tails behind legs
      const ct = (cc, dx, dy) => { cc.moveTo(-g.bw * 0.5 + dx, g.shY + 10 + dy); cc.lineTo(-g.bw * 0.62 + dx - this.capeSway * 3, g.hipY + 22 + dy); cc.lineTo(g.bw * 0.5 + dx, g.hipY + 20 + dy); cc.lineTo(g.bw * 0.4 + dx, g.shY + 10 + dy); cc.closePath(); };
      cel(c, ct, { ...P(d.shirt), L, size: 18, outline: ol, lw: 3 });
    }
    const tt = this.torsoTrace(g);
    cel(c, tt, { ...sP, L, size: 26, outline: ol, lw: 3.4, gloss: d.armor ? mix(sP.base, '#ffffff', 0.55) : null, shadowAmt: d.armor ? 0.22 : 0.3 });
    c.save(); c.beginPath(); tt(c, 0, 0); c.clip();
    const s2 = P(d.shirt2);
    if (d.armor) { // plate lines + rivets
      c.strokeStyle = shade(sP.shadow, -0.25); c.lineWidth = 2;
      for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(-g.bw, g.shY + g.bh * i / 3.2); c.quadraticCurveTo(0, g.shY + g.bh * i / 3.2 + 6, g.bw, g.shY + g.bh * i / 3.2); c.stroke(); }
      c.fillStyle = '#d8342b'; c.beginPath(); c.moveTo(-4, g.shY + 6); c.lineTo(10, g.shY + 6); c.lineTo(10, g.shY + 22); c.quadraticCurveTo(3, g.shY + 30, -4, g.shY + 22); c.closePath(); c.fill(); c.strokeStyle = ol; c.lineWidth = 1.6; c.stroke();
      c.fillStyle = '#ffd34a'; c.beginPath(); star(c, 3, g.shY + 15, 4.5, 2, 5, 0); c.fill();
    } else if (d.apron) {
      c.fillStyle = s2.base; c.beginPath(); roundRect(c, -4, g.shY + 10, g.bw * 0.6, g.bh + 10, 6); c.fill(); c.strokeStyle = ol; c.lineWidth = 1.8; c.stroke();
      c.fillStyle = '#e85d5d'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) c.fillRect(-2 + i * 6, g.shY + 30 + j * 6, 6, 6);
    } else if (d.coat) {
      c.fillStyle = s2.base; c.beginPath(); c.moveTo(g.bw * 0.1, g.shY); c.lineTo(g.bw * 0.45, g.shY); c.lineTo(g.bw * 0.6, g.hipY + 8); c.lineTo(g.bw * 0.25, g.hipY + 8); c.closePath(); c.fill();
      c.strokeStyle = ol; c.lineWidth = 1.6; c.beginPath(); c.moveTo(g.bw * 0.1, g.shY); c.lineTo(g.bw * 0.25, g.hipY + 8); c.stroke();
      c.fillStyle = '#ff5a8a'; c.fillRect(g.bw * 0.05, g.shY + 14, 5, 8); c.fillStyle = '#5ad1ff'; c.fillRect(g.bw * 0.05 + 5, g.shY + 12, 3, 10);
    } else if (d.furry) {
      c.fillStyle = s2.base; c.beginPath(); c.ellipse(g.bw * 0.15, (g.shY + g.hipY) / 2 + 4, g.bw * 0.32, g.bh * 0.38, 0, 0, TAU); c.fill();
    } else {
      // tunic trim + collar
      c.fillStyle = s2.base; c.beginPath(); c.moveTo(-g.bw, g.hipY + 1); c.lineTo(g.bw, g.hipY + 1); c.lineTo(g.bw, g.hipY + 9); c.lineTo(-g.bw, g.hipY + 9); c.fill();
      c.beginPath(); c.moveTo(g.bw * 0.05, g.shY); c.lineTo(g.bw * 0.3, g.shY + 13); c.lineTo(g.bw * 0.5, g.shY); c.closePath(); c.fill();
      // quiver strap
      c.strokeStyle = shade(d.belt, -0.1); c.lineWidth = 4.5; c.beginPath(); c.moveTo(-g.bw * 0.45, g.shY + 4); c.lineTo(g.bw * 0.5, g.hipY - 4); c.stroke();
      c.strokeStyle = ol; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-g.bw * 0.45, g.shY + 1.8); c.lineTo(g.bw * 0.5, g.hipY - 6.2); c.moveTo(-g.bw * 0.45, g.shY + 6.2); c.lineTo(g.bw * 0.5, g.hipY - 1.8); c.stroke();
    }
    // belt
    if (!d.robe) {
      c.fillStyle = P(d.belt).base; c.fillRect(-g.bw, g.hipY - 3, g.bw * 2.2, 6);
      c.fillStyle = '#ffd34a'; c.strokeStyle = ol; c.lineWidth = 1.5; c.beginPath(); roundRect(c, g.bw * 0.2, g.hipY - 4.5, 8, 9, 2); c.fill(); c.stroke();
    }
    c.restore();
    c.beginPath(); tt(c, 0, 0); c.lineWidth = 3.4; c.strokeStyle = ol; c.stroke();
    if (d.furry) { // fur tufts on outline
      c.fillStyle = sP.base; c.strokeStyle = ol; c.lineWidth = 2.4;
      for (let i = 0; i < 5; i++) { const y = g.shY + 6 + i * g.bh / 5; c.beginPath(); c.moveTo(-g.bw * 0.52, y); c.lineTo(-g.bw * 0.68, y + 5); c.lineTo(-g.bw * 0.5, y + 8); c.fill(); c.stroke(); }
    }
    // quiver on back (most characters)
    if (!d.robe && !d.furry && !d.coat) this.drawQuiver(c, g, L);
  }

  drawQuiver(c, g, L) {
    const ol = this.ol, P = this.P.bind(this);
    c.save(); c.translate(-g.bw * 0.5, g.shY + 16); c.rotate(-0.45);
    for (let i = 0; i < 3; i++) { c.save(); c.translate(-3 + i * 4, -18); c.rotate(-1.57 + (i - 1) * 0.12); c.fillStyle = i === 1 ? '#ffffff' : this.def.shirt; c.strokeStyle = ol; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(10, -4); c.lineTo(12, 0); c.lineTo(10, 4); c.closePath(); c.fill(); c.stroke(); c.restore(); }
    cel(c, (cc, dx, dy) => { cc.moveTo(-7 + dx, -16 + dy); cc.lineTo(7 + dx, -16 + dy); cc.lineTo(6 + dx, 16 + dy); cc.quadraticCurveTo(dx, 20 + dy, -6 + dx, 16 + dy); cc.closePath(); }, { ...P('#7a4b2a'), L: rotL(L, -0.45), size: 10, outline: ol, lw: 2.6 });
    c.fillStyle = '#c9963f'; c.fillRect(-7, -13, 14, 3);
    c.restore();
  }

  drawBackHair(c, g, L, what) {
    const d = this.def, ol = this.ol, P = this.P.bind(this);
    if (d.cape) { // flowing cape behind body
      const sw = this.capeSway;
      const tr = (cc, dx, dy) => { cc.moveTo(-6 + dx, g.shY + 2 + dy); cc.quadraticCurveTo(-g.bw * 0.9 - sw * 6 + dx, g.shY + 30 + dy, -g.bw * 0.95 - sw * 12 + dx, g.hipY + 22 + dy); cc.lineTo(-g.bw * 0.45 - sw * 6 + dx, g.hipY + 16 + dy); cc.lineTo(-g.bw * 0.2 - sw * 8 + dx, g.hipY + 24 + dy); cc.lineTo(g.bw * 0.1 + dx, g.hipY + dy); cc.lineTo(g.bw * 0.2 + dx, g.shY + 4 + dy); cc.closePath(); };
      cel(c, tr, { ...P(shade(d.cape, -0.15)), L, size: 16, outline: ol, lw: 3 });
    }
    if (d.hair.type === 'braids') { // back braid
      this.braid(c, g.hx - g.R * 0.7, g.hy + 4, -0.25, P(shade(d.hair.color, -0.15)), L);
    }
    if (d.robe) { // royal cape
      const tr = (cc, dx, dy) => { cc.moveTo(-g.bw * 0.3 + dx, g.shY + dy); cc.quadraticCurveTo(-g.bw * 1.1 - this.capeSway * 5 + dx, g.shY + 40 + dy, -g.bw * 1.0 - this.capeSway * 10 + dx, -4 + dy); cc.lineTo(g.bw * 0.1 + dx, -4 + dy); cc.lineTo(g.bw * 0.2 + dx, g.shY + dy); cc.closePath(); };
      cel(c, tr, { ...P('#b8283b'), L, size: 16, outline: ol, lw: 3 });
    }
  }

  braid(c, x, y, rot, pc, L) {
    const ol = this.ol;
    for (let i = 0; i < 4; i++) {
      const bx = x + Math.sin(rot) * i * -9 + Math.sin(this.t * 2 + i) * 0.6, by = y + i * 9;
      cel(c, ell(bx, by, 6 - i * 0.4, 6.5), { ...pc, L, size: 7, outline: ol, lw: 2.4 });
    }
    c.fillStyle = '#e8423f'; c.strokeStyle = ol; c.lineWidth = 2; c.beginPath(); roundRect(c, x - 5, y + 33, 10, 5, 2); c.fill(); c.stroke();
  }

  drawParrot(c, g, L) {
    const ol = this.ol, x = -g.bw * 0.35, y = g.shY - 4 + Math.sin(this.t * 3) * 1.2, P = this.P.bind(this);
    c.save(); c.translate(x, y); c.rotate(Math.sin(this.t * 1.7) * 0.1);
    cel(c, ell(0, -8, 8, 11, -0.3), { ...P('#3fbf4f'), L, size: 9, outline: ol, lw: 2.4 });
    cel(c, (cc, dx, dy) => { cc.moveTo(-5 + dx, -4 + dy); cc.lineTo(-14 + dx, 10 + dy); cc.lineTo(-4 + dx, 2 + dy); cc.closePath(); }, { ...P('#2b6fd6'), L, size: 6, outline: ol, lw: 2 });
    cel(c, circ(3, -20, 7), { ...P('#e8423f'), L, size: 7, outline: ol, lw: 2.4 });
    c.fillStyle = '#ffcf3a'; c.beginPath(); c.moveTo(9, -22); c.quadraticCurveTo(15, -19, 10, -14); c.lineTo(8, -18); c.closePath(); c.fill(); c.strokeStyle = ol; c.lineWidth = 1.8; c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(5, -22, 2.6, 0, TAU); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(5.8, -22, 1.3, 0, TAU); c.fill();
    c.restore();
  }

  // ---------- head + face ----------
  headTrace(R) {
    const sh = this.def.head.shape;
    if (sh === 'oval') return ell(0, 0, R * 0.93, R * 1.07);
    if (sh === 'square') return (c, dx, dy) => roundRect(c, -R + dx, -R + dy, R * 2, R * 2.05, R * 0.62);
    return circ(0, 0, R);
  }

  drawHead(c, R, L, ex) {
    const d = this.def, ol = this.ol, P = this.P.bind(this);
    const skin = P(d.skin);
    const hairP = d.hair.color ? P(d.hair.color) : null;
    const hat = d.hat.type;
    // --- behind head ---
    if (hat === 'hood') {
      cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.2 + dx, -R * 1.25 + dy); cc.bezierCurveTo(-R * 1.5 + dx, -R * 1.2 + dy, -R * 1.9 + dx, R * 0.2 + dy, -R * 1.6 + dx, R * 1.2 + dy); cc.lineTo(-R * 0.4 + dx, R * 1.1 + dy); cc.closePath(); }, { ...P(d.hat.color2), L, size: 18, outline: ol, lw: 3.2 });
    }
    if (d.hair.type === 'wild') {
      cel(c, (cc, dx, dy) => { const n = 11; for (let i = 0; i <= n; i++) { const a = Math.PI * 0.55 + i / n * Math.PI * 1.25; const rr = R * (i % 2 ? 1.15 : 1.5) + Math.sin(this.t * 3 + i) * 1.2; const x = Math.cos(a) * rr - R * 0.1 + dx, y = Math.sin(a) * rr - R * 0.1 + dy; i ? cc.lineTo(x, y) : cc.moveTo(x, y); } cc.closePath(); }, { ...hairP, L, size: 18, outline: ol, lw: 3 });
    }
    if (d.hair.type === 'bun') {
      cel(c, circ(-R * 0.55, -R * 0.85, R * 0.42), { ...hairP, L, size: 10, outline: ol, lw: 3 });
    }
    if (d.hair.type === 'topknot') {
      cel(c, ell(-R * 0.25, -R * 1.18, R * 0.3, R * 0.24), { ...hairP, L, size: 8, outline: ol, lw: 3 });
      c.fillStyle = '#d8342b'; c.fillRect(-R * 0.36, -R * 1.02, R * 0.24, R * 0.18);
    }
    if (d.ears === 'goblin') {
      cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.55 + dx, -R * 0.25 + dy); cc.quadraticCurveTo(-R * 1.6 + dx, -R * 0.75 + dy, -R * 2.05 + dx, -R * 0.55 + dy); cc.quadraticCurveTo(-R * 1.5 + dx, R * 0.05 + dy, -R * 0.6 + dx, R * 0.3 + dy); cc.closePath(); }, { ...skin, L, size: 12, outline: ol, lw: 3 });
      c.fillStyle = mix(skin.shadow, '#c25a6a', 0.4); c.beginPath(); c.moveTo(-R * 0.75, -R * 0.15); c.quadraticCurveTo(-R * 1.5, -R * 0.55, -R * 1.85, -R * 0.52); c.quadraticCurveTo(-R * 1.4, -R * 0.05, -R * 0.75, R * 0.15); c.fill();
    }
    // head base
    const ht = this.headTrace(R);
    cel(c, ht, { ...skin, L, size: R * 1.6, outline: ol, lw: 3.4, shadowAmt: 0.22, rimW: 2.4 });
    if (d.furry) { // fur crown tufts
      c.fillStyle = skin.base; c.strokeStyle = ol; c.lineWidth = 2.6;
      for (let i = 0; i < 6; i++) { const a = -Math.PI * 0.95 + i * 0.36; const x = Math.cos(a) * R, y = Math.sin(a) * R; c.beginPath(); c.moveTo(x * 0.9, y * 0.9); c.lineTo(x * 1.18 + Math.cos(a + 0.5) * 3, y * 1.18 + Math.sin(a + 0.5) * 3); c.lineTo(Math.cos(a + 0.25) * R * 0.96, Math.sin(a + 0.25) * R * 0.96); c.fill(); c.stroke(); }
      // face patch
      c.fillStyle = P(d.fur).base; c.beginPath(); c.ellipse(R * 0.32, R * 0.15, R * 0.62, R * 0.62, 0, 0, TAU); c.fill();
    }
    // ear (back side)
    if (!d.ears && hat !== 'hood' && hat !== 'knight' && !d.furry) {
      cel(c, ell(-R * 0.2, R * 0.08, R * 0.2, R * 0.26), { ...skin, L, size: 6, outline: ol, lw: 2.6 });
      c.strokeStyle = skin.shadow; c.lineWidth = 2; c.beginPath(); c.arc(-R * 0.2, R * 0.08, R * 0.1, -1, 1.6); c.stroke();
    }
    if (d.wrinkles) { c.strokeStyle = rgbaS(skin.shadow, 0.9); c.lineWidth = 1.6; c.beginPath(); c.moveTo(R * 0.05, -R * 0.62); c.quadraticCurveTo(R * 0.35, -R * 0.68, R * 0.6, -R * 0.6); c.moveTo(R * 0.1, -R * 0.5); c.quadraticCurveTo(R * 0.35, -R * 0.55, R * 0.55, -R * 0.48); c.stroke(); }
    // hair under hats
    if (d.hair.type === 'tuft') {
      cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.3 + dx, -R * 0.95 + dy); cc.quadraticCurveTo(R * 0.6 + dx, -R * 1.05 + dy, R * 0.85 + dx, -R * 0.35 + dy); cc.quadraticCurveTo(R * 0.45 + dx, -R * 0.55 + dy, R * 0.2 + dx, -R * 0.45 + dy); cc.quadraticCurveTo(R * 0.1 + dx, -R * 0.62 + dy, -R * 0.3 + dx, -R * 0.5 + dy); cc.closePath(); }, { ...hairP, L, size: 10, outline: ol, lw: 2.6 });
    } else if (d.hair.type === 'braids' || d.hair.type === 'bun' || d.hair.type === 'topknot') {
      cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.98 + dx, R * 0.15 + dy); cc.bezierCurveTo(-R * 1.05 + dx, -R * 1.3 + dy, R * 0.9 + dx, -R * 1.35 + dy, R * 0.88 + dx, -R * 0.42 + dy); cc.quadraticCurveTo(R * 0.3 + dx, -R * 0.7 + dy, -R * 0.1 + dx, -R * 0.55 + dy); cc.quadraticCurveTo(-R * 0.45 + dx, -R * 0.3 + dy, -R * 0.6 + dx, R * 0.25 + dy); cc.closePath(); }, { ...hairP, L, size: 14, outline: ol, lw: 2.8 });
    } else if (d.hair.type === 'side') {
      cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.95 + dx, -R * 0.4 + dy); cc.quadraticCurveTo(-R * 1.15 + dx, R * 0.3 + dy, -R * 0.55 + dx, R * 0.55 + dy); cc.quadraticCurveTo(-R * 0.4 + dx, -R * 0.1 + dy, -R * 0.5 + dx, -R * 0.55 + dy); cc.closePath(); }, { ...hairP, L, size: 10, outline: ol, lw: 2.6 });
    }
    // cheeks
    if (d.freckles) { c.fillStyle = rgbaS(shade(d.skin, -0.35), 0.7); for (const [fx, fy] of [[0.22, 0.25], [0.32, 0.32], [0.18, 0.36], [0.72, 0.28], [0.8, 0.36]]) { c.beginPath(); c.arc(R * fx, R * fy, 1.3, 0, TAU); c.fill(); } }
    if (d.blush || ex === 'joy') { c.fillStyle = 'rgba(255,90,110,.32)'; c.beginPath(); c.ellipse(R * 0.18, R * 0.32, R * 0.2, R * 0.12, 0, 0, TAU); c.fill(); }

    // beard (under mouth)
    if (d.beard.type === 'full') {
      const bp = P(d.beard.color);
      cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.55 + dx, -R * 0.05 + dy); cc.quadraticCurveTo(-R * 0.55 + dx, R * 1.25 + dy, R * 0.45 + dx, R * 1.35 + dy); cc.quadraticCurveTo(R * 1.05 + dx, R * 1.1 + dy, R * 1.0 + dx, R * 0.25 + dy); cc.quadraticCurveTo(R * 0.6 + dx, R * 0.55 + dy, R * 0.15 + dx, R * 0.45 + dy); cc.quadraticCurveTo(-R * 0.2 + dx, R * 0.4 + dy, -R * 0.55 + dx, -R * 0.05 + dy); cc.closePath(); }, { ...bp, L, size: 16, outline: ol, lw: 3 });
      c.strokeStyle = bp.shadow; c.lineWidth = 1.6; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(R * (0.0 + i * 0.22), R * 0.75); c.quadraticCurveTo(R * (0.05 + i * 0.22), R * 1.0, R * (0.15 + i * 0.2), R * 1.15); c.stroke(); }
    } else if (d.beard.type === 'goatee') {
      cel(c, (cc, dx, dy) => { cc.moveTo(R * 0.25 + dx, R * 0.78 + dy); cc.quadraticCurveTo(R * 0.4 + dx, R * 1.35 + dy, R * 0.55 + dx, R * 1.25 + dy); cc.quadraticCurveTo(R * 0.7 + dx, R * 0.95 + dy, R * 0.75 + dx, R * 0.75 + dy); cc.closePath(); }, { ...P(d.beard.color), L, size: 6, outline: ol, lw: 2.4 });
    }
    // eyes, brows, mouth, nose
    this.drawFace(c, R, L, ex, skin);
    // mustache over mouth
    if (d.beard.type === 'mustache' || d.beard.type === 'full') {
      const mp = P(d.beard.color), wig = ex === 'ouch' ? Math.sin(this.t * 40) * 1.5 : 0;
      cel(c, (cc, dx, dy) => { const y0 = R * 0.38 + wig + dy, x0 = R * 0.62 + dx; cc.moveTo(x0, y0 - R * 0.05); cc.bezierCurveTo(x0 + R * 0.45, y0 - R * 0.15, x0 + R * 0.6, y0 + R * 0.2, x0 + R * 0.62, y0 + R * 0.02 - R * 0.18); cc.bezierCurveTo(x0 + R * 0.7, y0 + R * 0.35, x0 + R * 0.25, y0 + R * 0.32, x0, y0 + R * 0.14); cc.bezierCurveTo(x0 - R * 0.3, y0 + R * 0.32, x0 - R * 0.7, y0 + R * 0.3, x0 - R * 0.62, y0 - R * 0.16); cc.bezierCurveTo(x0 - R * 0.55, y0 + R * 0.12, x0 - R * 0.35, y0 - R * 0.12, x0, y0 - R * 0.05); cc.closePath(); }, { ...mp, L, size: 10, outline: ol, lw: 2.6 });
    }
    // --- hats / front hair ---
    this.drawHat(c, R, L, hat, hairP);
    if (d.hair.type === 'braids') this.braid(c, R * 0.35, R * 0.55, 0.15, hairP, L);
  }

  drawFace(c, R, L, ex, skin) {
    const d = this.def, ol = this.ol;
    const blink = this.blinkT < 0 && (ex === 'idle' || ex === 'aim' || ex === 'worried');
    const lx = this.mode === 'aim' ? 1 : this.look.x, ly = this.mode === 'aim' ? -Math.sin(this.aim) * 0.8 : this.look.y;
    const eyes = [{ x: R * 0.5, y: -R * 0.08, s: 1 }, { x: R * 0.02, y: -R * 0.1, s: 0.88 }];
    const narrow = d.eyes === 'narrow' ? 0.6 : 1;
    const beady = d.eyes === 'beady';
    for (let i = 0; i < 2; i++) {
      const e = eyes[i], rx = R * 0.21 * e.s, ry = R * 0.26 * e.s * narrow;
      if (d.eyes === 'patch' && i === 0) { // eye patch on front eye
        c.fillStyle = '#16121c'; c.beginPath(); c.ellipse(e.x, e.y, rx * 1.1, ry * 1.0, 0, 0, TAU); c.fill();
        c.strokeStyle = '#16121c'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(e.x - rx, e.y - ry * 0.5); c.lineTo(-R * 0.9, -R * 0.55); c.moveTo(e.x + rx * 0.9, e.y - ry * 0.4); c.lineTo(R * 0.95, -R * 0.4); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.ellipse(e.x - 2, e.y - 3, 2.5, 1.5, -0.5, 0, TAU); c.fill();
        continue;
      }
      let kind = 'open';
      if (blink) kind = 'closed';
      if (ex === 'ouch') kind = i === 0 ? 'squeeze' : 'squeeze';
      if (ex === 'joy') kind = 'happy';
      if (ex === 'ko') kind = 'x';
      if (ex === 'dizzy') kind = 'spiral';
      if (ex === 'aim' && i === 1 && !blink) kind = 'squint';
      const sclera = beady ? '#ffe66b' : '#ffffff';
      if (kind === 'open' || kind === 'squint') {
        const ryy = kind === 'squint' ? ry * 0.45 : ry * (ex === 'worried' ? 1.1 : 1);
        c.fillStyle = sclera; c.beginPath(); c.ellipse(e.x, e.y, rx, ryy, 0, 0, TAU); c.fill();
        c.save(); c.beginPath(); c.ellipse(e.x, e.y, rx, ryy, 0, 0, TAU); c.clip();
        const px = e.x + clamp(lx, -1, 1) * rx * 0.4, py = e.y + clamp(ly, -1, 1) * ryy * 0.35;
        const pr = beady ? rx * 0.42 : rx * 0.55;
        c.fillStyle = d.furry ? '#2a5bd8' : '#2b1d2a'; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(px + pr * 0.35, py - pr * 0.4, pr * 0.32, 0, TAU); c.fill();
        // upper lid shading
        c.fillStyle = 'rgba(60,30,60,.18)'; c.fillRect(e.x - rx, e.y - ryy, rx * 2, ryy * 0.35);
        c.restore();
        c.strokeStyle = ol; c.lineWidth = 2.2; c.beginPath(); c.ellipse(e.x, e.y, rx, ryy, 0, 0, TAU); c.stroke();
        if (d.lashes) { c.lineWidth = 2; c.beginPath(); c.moveTo(e.x + rx * 0.7, e.y - ryy * 0.7); c.lineTo(e.x + rx * 1.25, e.y - ryy * 1.0); c.stroke(); }
      } else {
        c.strokeStyle = ol; c.lineWidth = 2.8; c.beginPath();
        if (kind === 'closed') { c.moveTo(e.x - rx, e.y + 1); c.quadraticCurveTo(e.x, e.y + ry * 0.5, e.x + rx, e.y + 1); }
        else if (kind === 'happy') { c.moveTo(e.x - rx, e.y + 2); c.quadraticCurveTo(e.x, e.y - ry * 1.1, e.x + rx, e.y + 2); }
        else if (kind === 'squeeze') { c.moveTo(e.x - rx, e.y - ry * 0.6); c.lineTo(e.x + rx * 0.6, e.y); c.lineTo(e.x - rx, e.y + ry * 0.6); if (i === 1) { c.moveTo(e.x + rx, e.y - ry * 0.6); c.lineTo(e.x - rx * 0.6, e.y); c.lineTo(e.x + rx, e.y + ry * 0.6); } }
        else if (kind === 'x') { c.moveTo(e.x - rx, e.y - ry * 0.7); c.lineTo(e.x + rx, e.y + ry * 0.7); c.moveTo(e.x + rx, e.y - ry * 0.7); c.lineTo(e.x - rx, e.y + ry * 0.7); }
        else if (kind === 'spiral') { c.fillStyle = '#fff'; c.ellipse(e.x, e.y, rx, ry, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); for (let k = 0; k < 22; k++) { const a = k * 0.6 + this.t * 8 * (i ? -1 : 1), rr = k / 22 * rx * 0.9; const x = e.x + Math.cos(a) * rr, y = e.y + Math.sin(a) * rr; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.lineWidth = 1.8; }
        c.stroke();
      }
    }
    if (d.eyes === 'glasses') {
      c.strokeStyle = '#3a2a4a'; c.lineWidth = 2.4;
      for (const e of eyes) { c.beginPath(); c.arc(e.x, e.y, R * 0.27 * e.s, 0, TAU); c.stroke(); }
      c.beginPath(); c.moveTo(eyes[1].x + R * 0.24, eyes[1].y); c.lineTo(eyes[0].x - R * 0.26, eyes[0].y); c.stroke();
      c.fillStyle = 'rgba(200,240,255,.18)'; for (const e of eyes) { c.beginPath(); c.arc(e.x, e.y, R * 0.26 * e.s, 0, TAU); c.fill(); }
    }
    // brows
    const browC = d.furry ? '#6c8fb0' : (d.hair.color && d.hair.type !== 'wild' ? shade(d.hair.color, -0.35) : (d.beard.color ? shade(d.beard.color, -0.2) : '#3a2420'));
    let bang = 0, braise = 0;
    if (ex === 'aim') { bang = 0.38; braise = 1; } else if (ex === 'ouch') { bang = -0.45; braise = -5; } else if (ex === 'worried') { bang = -0.4; braise = -2; }
    else if (ex === 'joy') { bang = -0.15; braise = -4; } else if (ex === 'ko' || ex === 'dizzy') { bang = -0.3; braise = -3; } else bang = 0.08;
    if (d.hat.type !== 'knight' || true) {
      c.strokeStyle = browC; c.lineWidth = d.furry ? 4 : 4.6; c.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const e = eyes[i], bx = e.x, by = e.y - R * 0.36 + braise; const dir = i === 0 ? 1 : -1; const w = R * 0.2;
        // inner end is toward the other eye: for front eye inner is left (-x)
        const inner = i === 0 ? -1 : 1, a = bang * inner * -1;
        c.beginPath(); c.moveTo(bx - w * Math.cos(a), by - w * Math.sin(a) * dir * -1 * inner);
        c.save(); c.translate(bx, by); c.rotate(i === 0 ? -bang : bang); c.beginPath(); c.moveTo(-w, 0); c.quadraticCurveTo(0, -3, w, 0); c.stroke(); c.restore();
      }
    }
    // nose
    const ns = d.nose || 1, nx = R * 0.78, ny = R * 0.18;
    const sk = skin;
    if (!d.furry || true) {
      cel(c, ell(nx, ny, R * 0.2 * ns, R * 0.17 * ns, -0.2), { base: mix(sk.base, '#e0786a', 0.18), shadow: mix(sk.shadow, '#c0504a', 0.2), rim: sk.rim, L, size: 7 * ns, outline: ol, lw: 2.6 });
      c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(nx - R * 0.03, ny - R * 0.07 * ns, R * 0.06, R * 0.035, -0.4, 0, TAU); c.fill();
    }
    // mouth
    this.drawMouth(c, R, ex);
  }

  drawMouth(c, R, ex) {
    const d = this.def, ol = this.ol; const mx = R * 0.5, my = R * 0.56;
    c.lineWidth = 2.6; c.strokeStyle = ol; c.lineJoin = 'round';
    const dark = '#5a1f2a', tongue = '#ff7a8a';
    const openShape = (w, h, yoff = 0, teethTop = true) => {
      c.beginPath(); c.moveTo(mx - w, my + yoff); c.quadraticCurveTo(mx, my + yoff - h * 0.25, mx + w, my + yoff); c.quadraticCurveTo(mx + w * 0.9, my + yoff + h, mx, my + yoff + h); c.quadraticCurveTo(mx - w * 0.9, my + yoff + h, mx - w, my + yoff); c.closePath();
      c.fillStyle = dark; c.fill();
      c.save(); c.clip();
      if (teethTop) { c.fillStyle = '#fff'; c.fillRect(mx - w, my + yoff - h * 0.3, w * 2, h * 0.38); }
      c.fillStyle = tongue; c.beginPath(); c.ellipse(mx + w * 0.1, my + yoff + h * 0.95, w * 0.6, h * 0.4, 0, 0, TAU); c.fill();
      c.restore(); c.stroke();
    };
    switch (ex) {
      case 'aim': { // gritted teeth
        const w = R * 0.32, h = R * 0.17; c.beginPath(); roundRect(c, mx - w, my - h * 0.4, w * 2, h, 4); c.fillStyle = '#fff'; c.fill(); c.stroke();
        c.lineWidth = 1.4; c.beginPath(); c.moveTo(mx - w, my + h * 0.1); c.lineTo(mx + w, my + h * 0.1); for (let i = -1; i <= 1; i++) { c.moveTo(mx + i * w * 0.5, my - h * 0.4); c.lineTo(mx + i * w * 0.5, my + h * 0.6); } c.stroke(); break; }
      case 'ouch': openShape(R * 0.22, R * 0.4 + Math.sin(this.t * 30) * 1.5, -R * 0.02, false); break;
      case 'dizzy': c.beginPath(); for (let i = 0; i <= 8; i++) { const x = mx - R * 0.3 + i * R * 0.075, y = my + Math.sin(i * 1.6 + this.t * 10) * 2.5; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); break;
      case 'joy': openShape(R * 0.36, R * 0.4, -R * 0.04, true); break;
      case 'ko': { c.beginPath(); c.moveTo(mx - R * 0.28, my + 2); c.quadraticCurveTo(mx, my - 3, mx + R * 0.28, my + 2); c.stroke();
        c.fillStyle = tongue; c.beginPath(); c.moveTo(mx + R * 0.02, my + 1); c.quadraticCurveTo(mx + R * 0.05, my + R * 0.45, mx + R * 0.2, my + R * 0.42); c.quadraticCurveTo(mx + R * 0.3, my + R * 0.3, mx + R * 0.24, my); c.closePath(); c.fill(); c.stroke(); break; }
      case 'worried': c.beginPath(); c.moveTo(mx - R * 0.22, my + 4); c.quadraticCurveTo(mx - R * 0.08, my - 1, mx, my + 3); c.quadraticCurveTo(mx + R * 0.1, my + 6, mx + R * 0.24, my + 1); c.stroke(); break;
      default: { // confident smirk
        c.beginPath(); c.moveTo(mx - R * 0.26, my + 1); c.quadraticCurveTo(mx, my + R * 0.18, mx + R * 0.3, my - R * 0.06); c.stroke();
        if (d.teeth) { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(mx + R * 0.1, my + R * 0.09); c.lineTo(mx + R * 0.16, my + R * 0.24); c.lineTo(mx + R * 0.21, my + R * 0.05); c.fill(); c.lineWidth = 1.4; c.stroke(); }
      }
    }
  }

  drawHat(c, R, L, hat, hairP) {
    const d = this.def, ol = this.ol, P = this.P.bind(this);
    const hc = d.hat.color ? P(d.hat.color) : null, h2 = d.hat.color2 ? P(d.hat.color2) : null;
    switch (hat) {
      case 'hood': {
        // cowl ring covering the back of the head with a face window
        cel(c, (cc, dx, dy) => { cc.moveTo(R * 0.95 + dx, -R * 0.35 + dy); cc.bezierCurveTo(R * 0.85 + dx, -R * 1.45 + dy, -R * 1.2 + dx, -R * 1.5 + dy, -R * 1.25 + dx, -R * 0.1 + dy); cc.bezierCurveTo(-R * 1.3 + dx, R * 0.7 + dy, -R * 0.8 + dx, R * 1.2 + dy, -R * 0.2 + dx, R * 1.15 + dy);
          cc.lineTo(-R * 0.15 + dx, R * 0.85 + dy); cc.bezierCurveTo(-R * 0.35 + dx, R * 0.4 + dy, -R * 0.45 + dx, -R * 0.2 + dy, -R * 0.2 + dx, -R * 0.62 + dy); cc.bezierCurveTo(R * 0.1 + dx, -R * 0.92 + dy, R * 0.7 + dx, -R * 0.9 + dy, R * 0.95 + dx, -R * 0.35 + dy); cc.closePath(); }, { ...hc, L, size: 18, outline: ol, lw: 3.2 });
        c.strokeStyle = h2.base; c.lineWidth = 2.2; c.beginPath(); c.moveTo(R * 0.85, -R * 0.45); c.bezierCurveTo(R * 0.6, -R * 0.82, R * 0.1, -R * 0.85, -R * 0.12, -R * 0.55); c.stroke();
        break; }
      case 'horned': {
        for (const s of [-1, 1]) { // horns
          const hx = s > 0 ? R * 0.75 : -R * 0.75;
          cel(c, (cc, dx, dy) => { cc.moveTo(hx - 6 * s + dx, -R * 0.62 + dy); cc.quadraticCurveTo(hx + R * 0.7 * s + dx, -R * 0.75 + dy, hx + R * 0.75 * s + dx, -R * 1.65 + dy); cc.quadraticCurveTo(hx + R * 0.35 * s + dx, -R * 1.0 + dy, hx - 3 * s + dx, -R * 1.02 + dy); cc.closePath(); }, { ...h2, L, size: 10, outline: ol, lw: 2.8 });
          c.strokeStyle = h2.shadow; c.lineWidth = 1.6; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(hx + R * 0.15 * i * s, -R * (0.72 + i * 0.08)); c.lineTo(hx + R * 0.15 * i * s + 3 * s, -R * (0.92 + i * 0.1)); c.stroke(); }
        }
        cel(c, (cc, dx, dy) => { cc.moveTo(-R * 1.02 + dx, -R * 0.3 + dy); cc.bezierCurveTo(-R * 1.0 + dx, -R * 1.45 + dy, R * 1.0 + dx, -R * 1.45 + dy, R * 1.02 + dx, -R * 0.3 + dy); cc.closePath(); }, { ...hc, L, size: 20, outline: ol, lw: 3.2, gloss: mix(hc.base, '#ffffff', 0.5), shadowAmt: 0.2 });
        cel(c, (cc, dx, dy) => roundRect(cc, -R * 1.08 + dx, -R * 0.45 + dy, R * 2.16, R * 0.24, 4), { ...P('#c9963f'), L, size: 6, outline: ol, lw: 2.6 });
        c.fillStyle = '#ffe9a8'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(i * R * 0.42, -R * 0.33, 1.8, 0, TAU); c.fill(); }
        // nose guard
        cel(c, (cc, dx, dy) => roundRect(cc, R * 0.62 + dx, -R * 0.45 + dy, R * 0.16, R * 0.5, 3), { ...hc, L, size: 4, outline: ol, lw: 2.2 });
        break; }
      case 'knight': {
        // plume
        const sw = Math.sin(this.t * 3) * 3;
        cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.1 + dx, -R * 1.1 + dy); cc.bezierCurveTo(-R * 0.4 + dx, -R * 2.0 + dy, -R * 1.6 + dx + sw, -R * 1.9 + dy, -R * 2.0 + dx + sw, -R * 0.9 + dy); cc.bezierCurveTo(-R * 1.4 + dx + sw, -R * 1.3 + dy, -R * 0.8 + dx, -R * 1.2 + dy, -R * 0.5 + dx, -R * 0.9 + dy); cc.closePath(); }, { ...h2, L, size: 12, outline: ol, lw: 2.8 });
        // helm dome + back guard
        cel(c, (cc, dx, dy) => { cc.moveTo(R * 1.02 + dx, -R * 0.28 + dy); cc.bezierCurveTo(R * 1.0 + dx, -R * 1.5 + dy, -R * 1.15 + dx, -R * 1.5 + dy, -R * 1.12 + dx, -R * 0.2 + dy); cc.lineTo(-R * 1.08 + dx, R * 0.75 + dy); cc.quadraticCurveTo(-R * 0.6 + dx, R * 0.95 + dy, -R * 0.25 + dx, R * 0.7 + dy); cc.lineTo(-R * 0.25 + dx, -R * 0.28 + dy); cc.closePath(); }, { ...hc, L, size: 22, outline: ol, lw: 3.2, gloss: mix(hc.base, '#ffffff', 0.6), shadowAmt: 0.22 });
        // raised visor
        cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.4 + dx, -R * 0.62 + dy); cc.quadraticCurveTo(R * 0.5 + dx, -R * 1.25 + dy, R * 1.3 + dx, -R * 0.75 + dy); cc.lineTo(R * 1.15 + dx, -R * 0.45 + dy); cc.quadraticCurveTo(R * 0.4 + dx, -R * 0.8 + dy, -R * 0.35 + dx, -R * 0.3 + dy); cc.closePath(); }, { ...P(shade(d.hat.color, -0.1)), L, size: 8, outline: ol, lw: 2.6 });
        c.strokeStyle = ol; c.lineWidth = 1.8; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(R * (0.3 + i * 0.25), -R * (0.82 + i * 0.03)); c.lineTo(R * (0.35 + i * 0.25), -R * (0.66 + i * 0.01)); c.stroke(); }
        c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(-R * 0.4, -R * 0.45, 2.2, 0, TAU); c.fill();
        break; }
      case 'toque': {
        cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.75 + dx, -R * 0.62 + dy); cc.lineTo(-R * 0.82 + dx, -R * 1.3 + dy); cc.arc(-R * 0.45 + dx, -R * 1.55 + dy, R * 0.48, Math.PI * 0.9, Math.PI * 1.75); cc.arc(R * 0.1 + dx, -R * 1.85 + dy, R * 0.52, Math.PI * 1.05, Math.PI * 1.95); cc.arc(R * 0.6 + dx, -R * 1.5 + dy, R * 0.45, Math.PI * 1.3, Math.PI * 0.15); cc.lineTo(R * 0.78 + dx, -R * 0.62 + dy); cc.closePath(); }, { ...hc, L, size: 18, outline: ol, lw: 3, shadow: mix(hc.base, '#a9b4d6', 0.5) });
        c.strokeStyle = h2.shadow; c.lineWidth = 1.6; for (const x of [-0.4, 0, 0.4]) { c.beginPath(); c.moveTo(R * x, -R * 0.75); c.lineTo(R * x * 1.1, -R * 1.25); c.stroke(); }
        cel(c, (cc, dx, dy) => roundRect(cc, -R * 0.86 + dx, -R * 0.84 + dy, R * 1.72, R * 0.3, 5), { ...hc, L, size: 6, outline: ol, lw: 2.6, shadow: mix(hc.base, '#a9b4d6', 0.5) });
        break; }
      case 'tricorn': {
        cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.85 + dx, -R * 0.62 + dy); cc.bezierCurveTo(-R * 0.9 + dx, -R * 1.55 + dy, R * 0.8 + dx, -R * 1.6 + dy, R * 0.85 + dx, -R * 0.62 + dy); cc.closePath(); }, { ...hc, L, size: 18, outline: ol, lw: 3 });
        cel(c, (cc, dx, dy) => { cc.moveTo(-R * 1.6 + dx, -R * 0.9 + dy); cc.quadraticCurveTo(-R * 0.6 + dx, -R * 0.3 + dy, R * 0.2 + dx, -R * 0.5 + dy); cc.quadraticCurveTo(R * 1.0 + dx, -R * 0.5 + dy, R * 1.55 + dx, -R * 1.05 + dy); cc.quadraticCurveTo(R * 1.1 + dx, -R * 0.55 + dy, R * 0.2 + dx, -R * 0.75 + dy); cc.quadraticCurveTo(-R * 0.6 + dx, -R * 0.6 + dy, -R * 1.6 + dx, -R * 0.9 + dy); cc.closePath(); }, { ...hc, L, size: 10, outline: ol, lw: 3 });
        c.strokeStyle = h2.base; c.lineWidth = 2; c.beginPath(); c.moveTo(-R * 1.45, -R * 0.86); c.quadraticCurveTo(-R * 0.6, -R * 0.42, R * 0.2, -R * 0.6); c.quadraticCurveTo(R * 1.0, -R * 0.6, R * 1.42, -R * 1.0); c.stroke();
        // skull emblem
        c.fillStyle = '#f4efe2'; c.beginPath(); c.arc(R * 0.0, -R * 1.05, R * 0.17, 0, TAU); c.fill(); c.fillRect(-R * 0.09, -R * 0.98, R * 0.18, R * 0.12);
        c.fillStyle = '#26222e'; c.beginPath(); c.arc(-R * 0.06, -R * 1.06, 1.6, 0, TAU); c.arc(R * 0.06, -R * 1.06, 1.6, 0, TAU); c.fill();
        break; }
      case 'headband': {
        cel(c, (cc, dx, dy) => { cc.moveTo(-R * 1.0 + dx, -R * 0.42 + dy); cc.quadraticCurveTo(dx, -R * 0.75 + dy, R * 0.92 + dx, -R * 0.52 + dy); cc.lineTo(R * 0.86 + dx, -R * 0.28 + dy); cc.quadraticCurveTo(dx, -R * 0.5 + dy, -R * 1.0 + dx, -R * 0.15 + dy); cc.closePath(); }, { ...hc, L, size: 6, outline: ol, lw: 2.6 });
        const w = Math.sin(this.t * 6) * 4 + this.wind * 6;
        for (const k of [0, 1]) { c.save(); c.translate(-R * 0.95, -R * 0.3); cel(c, (cc, dx, dy) => { cc.moveTo(dx, dy); cc.quadraticCurveTo(-R * 0.6 + dx, -R * 0.1 + w * 0.5 + k * 6 + dy, -R * (1.2 - k * 0.2) + dx, R * 0.2 + w + k * 8 + dy); cc.lineTo(-R * (1.1 - k * 0.2) + dx, R * 0.42 + w + k * 8 + dy); cc.quadraticCurveTo(-R * 0.5 + dx, R * 0.2 + k * 6 + dy, dx, R * 0.18 + dy); cc.closePath(); }, { ...hc, L, size: 5, outline: ol, lw: 2.2 }); c.restore(); }
        c.fillStyle = h2.base; c.beginPath(); c.arc(R * 0.2, -R * 0.52, R * 0.1, 0, TAU); c.fill();
        break; }
      case 'goggles': {
        c.strokeStyle = '#3a2a20'; c.lineWidth = 5; c.beginPath(); c.moveTo(-R * 0.98, -R * 0.35); c.quadraticCurveTo(0, -R * 0.95, R * 0.95, -R * 0.55); c.stroke();
        for (const gx of [R * 0.05, R * 0.6]) { cel(c, circ(gx, -R * 0.78, R * 0.27), { ...hc, L, size: 8, outline: ol, lw: 2.6, gloss: hc.hi }); c.fillStyle = h2.base; c.beginPath(); c.arc(gx, -R * 0.78, R * 0.17, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(gx - 2, -R * 0.83, 2.2, 0, TAU); c.fill(); }
        // front hair spikes
        cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.9 + dx, -R * 0.5 + dy); cc.lineTo(-R * 1.25 + dx, -R * 1.05 + dy); cc.lineTo(-R * 0.6 + dx, -R * 0.9 + dy); cc.lineTo(-R * 0.75 + dx, -R * 1.45 + dy); cc.lineTo(-R * 0.25 + dx, -R * 1.0 + dy); cc.closePath(); }, { ...hairP, L, size: 8, outline: ol, lw: 2.6 });
        break; }
      case 'cap': {
        cel(c, (cc, dx, dy) => { cc.moveTo(-R * 0.98 + dx, -R * 0.22 + dy); cc.bezierCurveTo(-R * 1.0 + dx, -R * 1.35 + dy, R * 0.95 + dx, -R * 1.4 + dy, R * 0.98 + dx, -R * 0.38 + dy); cc.quadraticCurveTo(dx, -R * 0.62 + dy, -R * 0.98 + dx, -R * 0.22 + dy); cc.closePath(); }, { ...hc, L, size: 18, outline: ol, lw: 3 });
        c.strokeStyle = h2.base; c.setLineDash([3, 3]); c.lineWidth = 1.6; c.beginPath(); c.moveTo(-R * 0.1, -R * 1.05); c.quadraticCurveTo(R * 0.2, -R * 0.7, R * 0.1, -R * 0.52); c.stroke(); c.setLineDash([]);
        cel(c, circ(-R * 0.1, -R * 1.05, R * 0.12), { ...h2, L, size: 4, outline: ol, lw: 2 });
        break; }
      case 'crown': {
        cel(c, (cc, dx, dy) => { const y0 = -R * 0.7 + dy, y1 = -R * 1.45 + dy; cc.moveTo(-R * 0.75 + dx, y0); cc.lineTo(-R * 0.85 + dx, y1); cc.lineTo(-R * 0.45 + dx, -R * 1.05 + dy); cc.lineTo(-R * 0.1 + dx, y1 - 4); cc.lineTo(R * 0.25 + dx, -R * 1.05 + dy); cc.lineTo(R * 0.6 + dx, y1); cc.lineTo(R * 0.7 + dx, y0); cc.closePath(); }, { ...hc, L, size: 14, outline: ol, lw: 3, gloss: mix(hc.base, '#fffbe0', 0.6), shadowAmt: 0.22 });
        c.fillStyle = h2.base; c.strokeStyle = ol; c.lineWidth = 1.6; for (const [x, y] of [[-0.85, -1.45], [-0.1, -1.55], [0.6, -1.45]]) { c.beginPath(); c.arc(R * x, R * y, 3, 0, TAU); c.fill(); c.stroke(); }
        c.fillStyle = '#4fb3ff'; c.beginPath(); c.arc(-R * 0.05, -R * 0.88, 3.2, 0, TAU); c.fill(); c.stroke();
        break; }
      case 'yetihorns': {
        for (const s of [-1, 1]) { const hx = s * R * 0.62; cel(c, (cc, dx, dy) => { cc.moveTo(hx - 5 + dx, -R * 0.8 + dy); cc.quadraticCurveTo(hx + s * R * 0.2 + dx, -R * 1.5 + dy, hx + s * R * 0.65 + dx, -R * 1.35 + dy); cc.quadraticCurveTo(hx + s * R * 0.3 + dx, -R * 1.2 + dy, hx + 5 + dx, -R * 0.75 + dy); cc.closePath(); }, { ...hc, L, size: 8, outline: ol, lw: 2.6 }); }
        break; }
    }
  }

  drawArms(c, g, p, L) {
    const d = this.def, ol = this.ol, P = this.P.bind(this);
    const sleeve = P(d.coat ? d.shirt : d.armor ? d.shirt : d.robe ? d.shirt : d.shirt);
    const skin = P(d.furry ? d.skin : d.skin);
    const aw = d.furry ? 8 : 6.4;
    // bow arm
    cel(c, (cc, dx, dy) => capsule(cc, p.bsh.x, p.bsh.y, p.belbow.x, p.belbow.y, aw + 0.6, aw, dx, dy), { ...sleeve, L, size: 10, outline: ol, lw: 3 });
    cel(c, (cc, dx, dy) => capsule(cc, p.belbow.x, p.belbow.y, p.hand.x, p.hand.y, aw, aw - 0.8, dx, dy), { ...(d.armor ? sleeve : skin), L, size: 9, outline: ol, lw: 3 });
    // bow
    this.drawBow(c, p);
    // hand gripping bow
    cel(c, circ(p.hand.x, p.hand.y, 6.6), { ...skin, L, size: 7, outline: ol, lw: 2.8 });
    // draw arm
    cel(c, (cc, dx, dy) => capsule(cc, p.dsh.x, p.dsh.y, p.delbow.x, p.delbow.y, aw + 0.6, aw, dx, dy), { ...sleeve, L, size: 10, outline: ol, lw: 3 });
    cel(c, (cc, dx, dy) => capsule(cc, p.delbow.x, p.delbow.y, p.dhand.x, p.dhand.y, aw, aw - 0.8, dx, dy), { ...(d.armor ? sleeve : skin), L, size: 9, outline: ol, lw: 3 });
    cel(c, circ(p.dhand.x, p.dhand.y, 6.4), { ...skin, L, size: 7, outline: ol, lw: 2.8 });
  }

  drawBow(c, p) {
    const b = this.bow, ol = this.ol, aiming = this.aimBlend > 0.3 && this.mode === 'aim';
    c.save(); c.translate(p.hand.x, p.hand.y); c.rotate(-p.aim);
    const Lb = p.bowLen, k = p.bend;
    const rc = !!b.recurve, tx = rc ? -k + 6 : -k, ty = rc ? Lb + 3 : Lb;
    const trace = () => {
      c.beginPath();
      if (rc) { c.moveTo(tx, -ty); c.quadraticCurveTo(-k - 2, -Lb + 4, -k + 1, -Lb + 9); } else c.moveTo(-k, -Lb);
      c.quadraticCurveTo(14, -Lb * 0.35, 4, 0); c.quadraticCurveTo(14, Lb * 0.35, rc ? -k + 1 : -k, rc ? Lb - 9 : Lb);
      if (rc) c.quadraticCurveTo(-k - 2, Lb - 4, tx, ty);
    };
    // string
    const sx = aiming ? -(k + p.pull) : tx;
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(tx, -ty); c.lineTo(sx, 0); c.lineTo(tx, ty); c.stroke();
    // nocked arrow
    if (aiming && this.hasArrow) { c.save(); c.translate(sx + 64, 0); drawArrow(c, 64, 0, this.arrowLook, 1); c.restore();
      if (b.fire || b.storm) { c.globalCompositeOperation = 'lighter'; const gl = c.createRadialGradient(sx + 66, 0, 0, sx + 66, 0, 16); gl.addColorStop(0, b.fire ? 'rgba(255,170,60,.9)' : 'rgba(150,240,255,.9)'); gl.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gl; c.fillRect(sx + 50, -16, 32, 32); c.globalCompositeOperation = 'source-over'; } }
    trace(); c.strokeStyle = ol; c.lineWidth = 8; c.stroke();
    trace(); c.strokeStyle = b.wood; c.lineWidth = 4.6; c.stroke();
    c.save(); c.translate(-1, -1); trace(); c.strokeStyle = mix(b.wood, '#ffffff', 0.45); c.lineWidth = 1.4; c.stroke(); c.restore();
    // grip wrap
    c.strokeStyle = ol; c.lineWidth = 9; c.beginPath(); c.moveTo(6, -8); c.quadraticCurveTo(8, 0, 6, 8); c.stroke();
    c.strokeStyle = b.wrap; c.lineWidth = 6; c.beginPath(); c.moveTo(6, -7); c.quadraticCurveTo(8, 0, 6, 7); c.stroke();
    if (b.storm || b.fire) { c.fillStyle = b.storm ? '#bff6ff' : '#ffb13b'; c.beginPath(); c.arc(9, -Lb * 0.45, 2.5, 0, TAU); c.arc(9, Lb * 0.45, 2.5, 0, TAU); c.fill(); }
    c.restore();
  }
}
function rgbaS(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

/** Draw a hero head portrait into a 2D context centered at (cx,cy) with radius-ish size */
export function drawPortrait(ctx, def, cx, cy, size, ex = 'idle', faceDir = 1) {
  const f = new Fighter(def, { wood: '#9a6233', wrap: '#fff' }, -1);
  f.t = 1; f.blinkT = 3; f.mode = ex === 'joy' ? 'victory' : 'idle';
  const R = def.head.r, s = size / (R * 2.9);
  ctx.save(); ctx.translate(cx, cy + R * 0.25 * s); ctx.scale(s * faceDir, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  f.Lc = { x: -0.55 * faceDir, y: -0.83 };
  f.drawHead(ctx, R, { x: -0.55 * faceDir, y: -0.83 }, ex);
  ctx.restore();
}
