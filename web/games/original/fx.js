// Particles (pooled): feathers, sparks, splashes, embers in world space; weather in screen space.
import { css, hash1 } from './util.js';
import { glowPush } from './glow.js';

const POOL = []; let live = 0;
function get() { let p = POOL[live]; if (!p) p = POOL[live] = {}; live++; return p; }
export function resetFx() { live = 0; }

export function feathers(x, y, vx, n = 5) {
  for (let i = 0; i < n; i++) { const p = get(); p.k = 0; p.x = x; p.y = y; p.vx = vx * 0.4 + (Math.random() - 0.5) * 18; p.vy = (Math.random() - 0.8) * 14; p.r = Math.random() * 6; p.vr = (Math.random() - 0.5) * 8; p.t = 0; p.life = 1.6 + Math.random(); p.s = 0.5 + Math.random() * 0.5; }
}
export function sparks(x, y, n = 6, big = 1) {
  for (let i = 0; i < n; i++) { const p = get(); p.k = 1; p.x = x; p.y = y; const a = Math.random() * 6.28, sp = (8 + Math.random() * 16) * big; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.t = 0; p.life = 0.45 + Math.random() * 0.35; p.s = big; }
}
export function splash(x, y) {
  for (let i = 0; i < 7; i++) { const p = get(); p.k = 2; p.x = x; p.y = y; p.vx = (Math.random() - 0.5) * 14; p.vy = -10 - Math.random() * 14; p.t = 0; p.life = 0.7; p.s = 0.4 + Math.random() * 0.4; }
}
export function ring(x, y, col) { const p = get(); p.k = 3; p.x = x; p.y = y; p.t = 0; p.life = 0.6; p.vx = 0; p.vy = 0; p.s = 1; p.col = col; }

export function updateFx(dt, speed) {
  for (let i = 0; i < live; i++) {
    const p = POOL[i]; p.t += dt;
    if (p.t >= p.life) { const last = POOL[live - 1]; POOL[live - 1] = p; POOL[i] = last; live--; i--; continue; }
    if (p.k === 0) { p.vy += (6 - p.vy) * dt * 1.5; p.vx += (speed * 0.2 - p.vx) * dt * 1.2; p.x += p.vx * dt + Math.sin(p.t * 5 + p.r) * 0.08; p.y += p.vy * dt; p.r += p.vr * dt; }
    else if (p.k === 1) { p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; p.x += (p.vx + speed) * dt; p.y += p.vy * dt; }
    else if (p.k === 2) { p.vy += 50 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    else { p.x += speed * dt; }
  }
}

export function drawFx(c, s, camX, P) {
  // feathers (dark, small leaf shapes)
  c.fillStyle = css(P.bird, 0.9);
  c.beginPath();
  for (let i = 0; i < live; i++) {
    const p = POOL[i]; if (p.k !== 0) continue;
    const x = (p.x - camX) * s, y = p.y * s, L = 1.1 * s * p.s, W = 0.35 * s * p.s, ca = Math.cos(p.r), sa = Math.sin(p.r);
    c.moveTo(x + ca * L, y + sa * L); c.quadraticCurveTo(x - sa * W, y + ca * W, x - ca * L, y - sa * L); c.quadraticCurveTo(x + sa * W, y - ca * W, x + ca * L, y + sa * L);
  }
  c.fill();
  // splashes
  c.fillStyle = css(P.cap, 0.8); c.beginPath();
  for (let i = 0; i < live; i++) { const p = POOL[i]; if (p.k !== 2) continue; const r = p.s * s * (1 - p.t / p.life); c.moveTo((p.x - camX) * s + r, p.y * s); c.arc((p.x - camX) * s, p.y * s, r, 0, 6.283); }
  c.fill();
  // rings
  for (let i = 0; i < live; i++) {
    const p = POOL[i]; if (p.k !== 3) continue; const k = p.t / p.life;
    c.strokeStyle = css(p.col || P.mote, (1 - k) * 0.8); c.lineWidth = s * 0.35 * (1 - k);
    c.beginPath(); c.arc((p.x - camX) * s, p.y * s, s * (2 + k * 9), 0, 6.283); c.stroke();
  }
  // sparks -> glow queue
  for (let i = 0; i < live; i++) { const p = POOL[i]; if (p.k !== 1) continue; const k = 1 - p.t / p.life; glowPush(p.x - camX, p.y, 0.55 * p.s * k + 0.1, k); }
}

// ---------------- weather (screen space, deterministic from time) ----------------
export function drawWeather(c, V, P, q) {
  const { w, h, s, t, camX } = V;
  const N = q ? 1 : 0.5;
  if (P.dust > 0.05) { // floating pollen / dust motes, lit by the sun
    c.fillStyle = css(P.rim, 0.5 * P.dust);
    c.beginPath();
    const n = (40 * N) | 0;
    for (let i = 0; i < n; i++) {
      const sp = 0.5 + hash1(i, 1) * 1.2;
      const x = (((hash1(i, 2) * w * 1.2 - (camX * 0.9 * sp + t * 6) * s) % (w * 1.2)) + w * 1.2) % (w * 1.2) - w * 0.1;
      const y = (hash1(i, 3) * 0.9 + Math.sin(t * 0.5 + i) * 0.03) * h;
      const r = (0.12 + hash1(i, 4) * 0.22) * s * sp;
      c.moveTo(x + r, y); c.arc(x, y, r, 0, 6.283);
    }
    c.fill();
  }
  if (P.rain > 0.05) {
    c.strokeStyle = css(P.cap, 0.32 * P.rain); c.lineWidth = Math.max(1, s * 0.12);
    c.beginPath();
    const n = (150 * N) | 0, vy = 1.6 * h, len = 3.2 * s;
    for (let i = 0; i < n; i++) {
      const x = ((hash1(i, 5) * w * 1.3 - t * 0.35 * w - camX * s * 0.6) % (w * 1.3) + w * 1.3) % (w * 1.3);
      const y = ((hash1(i, 6) * h * 1.2 + t * vy * (0.8 + hash1(i, 7) * 0.4)) % (h * 1.2)) - h * 0.1;
      c.moveTo(x, y); c.lineTo(x - len * 0.35, y + len);
    }
    c.stroke();
  }
  if (P.snow > 0.05) {
    c.fillStyle = css([240, 246, 255], 0.75 * P.snow);
    c.beginPath();
    const n = (110 * N) | 0;
    for (let i = 0; i < n; i++) {
      const dep = 0.4 + hash1(i, 8) * 1.1;
      const x = ((hash1(i, 9) * w * 1.2 - (camX * dep * 0.5 + t * 4) * s + Math.sin(t * 0.8 + i) * 2 * s) % (w * 1.2) + w * 1.2) % (w * 1.2) - w * 0.1;
      const y = ((hash1(i, 10) * h * 1.1 + t * 6 * dep * s) % (h * 1.1)) - h * 0.05;
      const r = 0.22 * s * dep; c.moveTo(x + r, y); c.arc(x, y, r, 0, 6.283);
    }
    c.fill();
  }
  if (P.lantern > 0.05) { // rising sky lanterns (glow)
    const n = (16 * N) | 0;
    for (let i = 0; i < n; i++) {
      const dep = 0.3 + hash1(i, 11) * 0.7;
      const x = ((hash1(i, 12) * w * 1.3 - camX * s * dep * 0.25) % (w * 1.3) + w * 1.3) % (w * 1.3) - w * 0.15;
      const y = h * (1.05 - ((hash1(i, 13) + t * 0.012 * dep) % 1.0) * 1.1);
      glowPush(x / s + Math.sin(t * 0.7 + i) * 0.8, y / s, 0.9 * dep + 0.3, 0.85 * P.lantern, LANT);
      c.fillStyle = 'rgba(255,200,120,' + (0.9 * P.lantern).toFixed(2) + ')';
      c.fillRect(x + Math.sin(t * 0.7 + i) * 0.8 * s - 0.35 * s * dep, y - 0.5 * s * dep, 0.7 * s * dep, 0.9 * s * dep);
    }
  }
}
export const LANT = [255, 170, 80];
