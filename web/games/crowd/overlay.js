// 2D overlay canvas: crowd count bubbles, leader names, +N popups, off-screen arrows.
import * as THREE from 'three';
import { A, teams, crowdRadius } from './sim.js';
import { R } from './render.js';

let cv, g, W = 0, H = 0, dpr = 1;
const pops = []; const MAXP = 48;
const _v = new THREE.Vector3();
export function initOverlay(canvas) { cv = canvas; g = cv.getContext('2d'); resizeOverlay(); }
export function resizeOverlay() {
  dpr = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
}
export function clearPops() { pops.length = 0; }
export function addPop(x, y, z, text, color, big = false) {
  if (pops.length >= MAXP) pops.shift();
  pops.push({ x, y, z, text, color, t: 0, big, dx: (Math.random() - 0.5) * 18 });
}
function project(x, y, z) {
  _v.set(x, y, z).project(R.camera);
  return [(_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H, _v.z];
}
function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function shade(hex, k) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); }
const darkCache = new Map(); const dark = hex => { if (!darkCache.has(hex)) darkCache.set(hex, shade(hex, -0.22)); return darkCache.get(hex); };

export function drawOverlay(dt, opts) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (!opts.labels) { pops.length = 0; return; }
  const safeTop = opts.safeTop ?? 70, safeBot = opts.safeBot ?? 20;
  // bubbles (draw small crowds first so bigger are on top)
  const order = teams.filter(t => t.alive).sort((a, b) => a.count - b.count);
  for (const T of order) {
    const L = T.leader; const lift = 2.4 + Math.min(4, crowdRadius(T.count) * 0.12);
    const [sx, sy, sz] = project(A.x[L], A.y[L] + lift, A.z[L]);
    const on = sz < 1 && sx > 14 && sx < W - 14 && sy > safeTop && sy < H - safeBot;
    T.bubble += ((T.bubbleTarget ?? 1) - T.bubble) * Math.min(1, dt * 10);
    const pulse = T.pulse ? Math.max(0, T.pulse -= dt * 3) : 0;
    if (on) bubble(sx, sy, T, 1 + pulse * 0.25);
    else arrow(sx, sy, sz, T, safeTop, safeBot);
  }
  // popups
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = pops.length - 1; k >= 0; k--) {
    const p = pops[k]; p.t += dt; const life = p.big ? 1.3 : 0.85;
    if (p.t > life) { pops.splice(k, 1); continue; }
    const [sx, sy, sz] = project(p.x, p.y + 1.4, p.z); if (sz > 1) continue;
    const u = p.t / life; const rise = u * (p.big ? 60 : 42);
    const sc = u < 0.15 ? 0.6 + u / 0.15 * 0.6 : 1.2 - Math.min(0.2, (u - 0.15) * 0.6);
    const a = u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1;
    const fs = (p.big ? 30 : 19) * sc;
    g.globalAlpha = a; g.font = `${fs}px 'Lilita One', sans-serif`; g.lineJoin = 'round';
    g.lineWidth = p.big ? 7 : 5; g.strokeStyle = 'rgba(20,24,48,0.9)'; g.strokeText(p.text, sx + p.dx * u, sy - rise);
    g.fillStyle = p.color; g.fillText(p.text, sx + p.dx * u, sy - rise);
  }
  g.globalAlpha = 1;
}

function bubble(x, y, T, s) {
  const txt = String(T.count);
  const fs = (T.isPlayer ? 19 : 16) * s;
  g.font = `${fs}px 'Lilita One', sans-serif`;
  const tw = g.measureText(txt).width; const w = Math.max(tw + 22 * s, 40 * s), h = fs + 12 * s;
  const bx = x - w / 2, by = y - h - 9 * s;
  // shadow
  g.fillStyle = 'rgba(20,24,48,0.28)'; rr(bx + 1, by + 4, w, h, h / 2); g.fill();
  // pointer
  g.fillStyle = dark(T.hex); g.beginPath(); g.moveTo(x - 7 * s, by + h - 2); g.lineTo(x + 7 * s, by + h - 2); g.lineTo(x, by + h + 8 * s); g.closePath(); g.fill();
  // pill
  const gr = g.createLinearGradient(0, by, 0, by + h); gr.addColorStop(0, shade(T.hex, 0.08)); gr.addColorStop(1, dark(T.hex));
  g.fillStyle = gr; rr(bx, by, w, h, h / 2); g.fill();
  g.lineWidth = 2.2 * s; g.strokeStyle = 'rgba(255,255,255,0.92)'; rr(bx, by, w, h, h / 2); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 4 * s; g.strokeStyle = 'rgba(20,24,48,0.55)'; g.strokeText(txt, x, by + h / 2 + 1);
  g.fillStyle = '#fff'; g.fillText(txt, x, by + h / 2 + 1);
  // name tag
  const nm = T.isPlayer ? 'YOU' : T.name;
  g.font = `900 ${11 * s}px 'Nunito', sans-serif`;
  g.lineWidth = 3.5; g.strokeStyle = 'rgba(20,24,48,0.75)'; g.strokeText(nm, x, by - 8 * s);
  g.fillStyle = T.isPlayer ? '#ffe14d' : '#ffffff'; g.fillText(nm, x, by - 8 * s);
}

function arrow(sx, sy, sz, T, safeTop, safeBot) {
  // direction from screen centre; behind camera -> flip
  let dx = sx - W / 2, dy = sy - H / 2; if (sz > 1) { dx = -dx; dy = -dy; }
  const m = 26; const x0 = m, x1 = W - m, y0 = safeTop + 30, y1 = H - safeBot - 70;
  const cx = W / 2, cy = H / 2; let t = 1e9;
  if (dx > 0) t = Math.min(t, (x1 - cx) / dx); if (dx < 0) t = Math.min(t, (x0 - cx) / dx);
  if (dy > 0) t = Math.min(t, (y1 - cy) / dy); if (dy < 0) t = Math.min(t, (y0 - cy) / dy);
  const px = cx + dx * t, py = cy + dy * t; const a = Math.atan2(dy, dx);
  const r = T.isPlayer ? 18 : 15;
  g.save(); g.translate(px, py);
  g.rotate(a); g.fillStyle = dark(T.hex); g.beginPath(); g.moveTo(r + 10, 0); g.lineTo(r - 2, -8); g.lineTo(r - 2, 8); g.closePath(); g.fill(); g.rotate(-a);
  g.fillStyle = 'rgba(20,24,48,0.25)'; g.beginPath(); g.arc(1, 3, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = T.hex; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = 2.2; g.strokeStyle = '#fff'; g.stroke();
  g.font = `${T.count > 999 ? 11 : 13}px 'Lilita One', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 3; g.strokeStyle = 'rgba(20,24,48,0.5)'; g.strokeText(String(T.count), 0, 1); g.fillStyle = '#fff'; g.fillText(String(T.count), 0, 1);
  g.restore();
}
