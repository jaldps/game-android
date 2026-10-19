// DOM UI: HUD, banners, hints, popups, title, species, settings, results.
import { LEGS, LEG_LEN } from './palette.js';
import { S, SPECIES } from './store.js';
import { css, mix } from './util.js';

export const $ = id => document.getElementById(id);
const pops = $('popups');
let lastScore = -1, lastFlock = -1, lastMult = -1, lastLeg = -1, lastAcc = '';

export function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
export function hud(G, F, P) {
  const sc = Math.floor(G.score + G.dist);
  if (sc !== lastScore) { $('scoreTxt').textContent = sc.toLocaleString('en-US'); lastScore = sc; }
  if (F.alive !== lastFlock) { const el = $('flockTxt'); if (F.alive < lastFlock) { el.classList.remove('hurt'); void el.offsetWidth; el.classList.add('hurt'); } el.textContent = F.alive; lastFlock = F.alive; }
  if (G.mult !== lastMult) { const m = $('multTxt'); m.textContent = '×' + G.mult; m.classList.toggle('hot', G.mult >= 3); if (G.mult > lastMult) { m.classList.add('bump'); setTimeout(() => m.classList.remove('bump'), 180); } lastMult = G.mult; }
  const li = P.leg, f = P.legF;
  if (li !== lastLeg) {
    const L = LEGS[li % 5]; $('legRoman').textContent = li >= 5 ? '∞' : L.roman; $('legTitle').textContent = L.name; lastLeg = li;
    const dots = $('legTrack').querySelectorAll('i'); dots.forEach((d, i) => d.classList.toggle('done', i <= (li % 5) || li >= 5));
  }
  const k = ((li % 5) + Math.min(1, f)) / 5; // position along the 5-leg track (dots sit at 0,.25,.5,.75,1 -> map legs)
  const pos = Math.min(1, ((li % 5) + f) / 4.0);
  $('legFill').style.width = (Math.min(1, pos) * 100) + '%'; $('legDot').style.left = (Math.min(1, pos) * 100) + '%';
  const acc = css(P.mote);
  if (acc !== lastAcc) { document.documentElement.style.setProperty('--acc', acc); lastAcc = acc; }
}
export function resetHud() { lastScore = lastFlock = lastMult = lastLeg = -1; }

let bannerT = 0;
export function banner(roman, name, sub) {
  $('bnRoman').textContent = roman; $('bnName').textContent = name; $('bnSub').textContent = sub || '';
  const b = $('banner'); b.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), 2600);
}
const ICONS = {
  drag: `<svg viewBox="0 0 40 40"><g class="hand"><path d="M16 20V9a2.6 2.6 0 0 1 5.2 0v8.4l6.4 1.3a3.2 3.2 0 0 1 2.6 3.6L29 31a4 4 0 0 1-4 3.4h-6.4a4 4 0 0 1-3.1-1.5L10 26.4a2.3 2.3 0 0 1 3.5-3z" fill="#fff"/></g></svg>`,
  split: `<svg viewBox="0 0 44 40"><g class="hand2a"><path d="M9 14V6a2 2 0 0 1 4 0v6l4.6 1a2.4 2.4 0 0 1 2 2.7L19 22a3 3 0 0 1-3 2.6h-4.6a3 3 0 0 1-2.4-1.2l-4-5a1.8 1.8 0 0 1 2.7-2.3z" fill="#fff"/></g><g class="hand2b"><path d="M29 26v-8a2 2 0 0 1 4 0v6l4.6 1a2.4 2.4 0 0 1 2 2.7L39 34a3 3 0 0 1-3 2.6h-4.6a3 3 0 0 1-2.4-1.2l-4-5a1.8 1.8 0 0 1 2.7-2.3z" fill="#fff"/></g></svg>`,
  hawk: `<svg viewBox="0 0 40 40"><path d="M4 20c6-6 12-8 16-3 4-5 10-3 16 3-5-1-9 0-12 4l-4 6-4-6c-3-4-7-5-12-4z" fill="#fff"/></svg>`,
};
let hintT = 0;
export function hint(kind, text, dur = 3800) {
  $('hintIco').innerHTML = ICONS[kind] || ''; $('hintTxt').textContent = text;
  const h = $('hint'); h.classList.add('show'); clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('show'), dur);
}
export function hideHint() { $('hint').classList.remove('show'); }

let popN = 0;
export function popup(text, xFrac, yFrac, cls = '') {
  if (popN > 8) return; popN++;
  const d = document.createElement('div'); d.className = 'pop ' + cls; d.textContent = text;
  d.style.left = (xFrac * 100) + '%'; d.style.top = (yFrac * 100) + '%';
  pops.appendChild(d); setTimeout(() => { d.remove(); popN--; }, 1100);
}

// ---------- title: leg cards ----------
export function buildLegCards(onPick) {
  const wrap = $('legCards'); wrap.innerHTML = '';
  LEGS.forEach((L, i) => {
    const d = document.createElement('div'); d.className = 'lcard'; d.dataset.i = i;
    const cv = document.createElement('canvas'); cv.width = 124; cv.height = 168; d.appendChild(cv);
    paintCard(cv, L);
    const rn = document.createElement('div'); rn.className = 'rn'; rn.textContent = L.roman; d.appendChild(rn);
    d.onclick = () => onPick(i);
    wrap.appendChild(d);
  });
  refreshLegCards();
}
export function refreshLegCards() {
  $('legCards').querySelectorAll('.lcard').forEach((d, i) => { d.classList.toggle('locked', i > S.legs); d.classList.toggle('sel', i === S.startLeg); });
}
function paintCard(cv, L) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height, c = L.c;
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, css(c.skyTop)); gr.addColorStop(0.45, css(c.skyMid)); gr.addColorStop(0.75, css(c.skyLow)); gr.addColorStop(1, css(c.fog));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = css(c.sun); g.beginPath(); g.arc(w * L.pal.sunX, h * (L.pal.sunY * 0.8), 12, 0, 6.283); g.fill();
  for (let k = 0; k < 3; k++) {
    const col = mix(c.fog, c.near, 0.35 + k * 0.3); g.fillStyle = css(col); g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) {
      const base = h * (0.62 + k * 0.12); let y;
      if (L.style === 'peaks') y = base - Math.abs(Math.sin(x * 0.03 + k * 2)) * 34 / (k + 1);
      else if (L.style === 'canyon') y = base - (Math.sin(x * 0.02 + k) > 0.2 ? 22 : 6) / (k * 0.5 + 1);
      else if (L.style === 'coast') y = base + 6 - Math.max(0, Math.sin(x * 0.05 + k * 3)) * 26 / (k + 1);
      else if (L.style === 'valley') y = base - (Math.sin(x * 0.025 + k) * 0.5 + 0.5) * 22 / (k * 0.6 + 1);
      else y = base - (Math.sin(x * 0.018 + k * 1.7) * 0.5 + 0.5) * 18;
      g.lineTo(x, y);
    }
    g.lineTo(w, h); g.closePath(); g.fill();
  }
  // tiny flock
  g.fillStyle = css(c.bird); for (let i = 0; i < 14; i++) { const x = w * 0.3 + Math.sin(i * 2.3) * 22 + i * 2, y = h * 0.35 + Math.cos(i * 1.7) * 12; g.fillRect(x, y, 3, 1.6); }
}

// ---------- species ----------
export function buildSpecies(onPick) {
  const grid = $('speciesGrid'); grid.innerHTML = '';
  SPECIES.forEach((sp, i) => {
    const d = document.createElement('div'); d.className = 'sp';
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 120; drawSpeciesIcon(cv, i); d.appendChild(cv);
    d.insertAdjacentHTML('beforeend', `<div class="nm">${sp.name}</div><div class="req">${sp.need ? sp.need.toLocaleString('en-US') + ' light' : 'Default'}</div>`);
    d.onclick = () => onPick(i);
    grid.appendChild(d);
  });
  refreshSpecies();
}
export function refreshSpecies() {
  $('speciesGrid').querySelectorAll('.sp').forEach((d, i) => { const lock = S.light < SPECIES[i].need; d.classList.toggle('locked', lock); d.classList.toggle('sel', i === S.species); d.querySelector('.req').textContent = lock ? (SPECIES[i].need.toLocaleString('en-US') + ' light') : (i === S.species ? 'Flying' : 'Unlocked'); });
  $('speciesName').textContent = SPECIES[S.species].name;
}
function drawSpeciesIcon(cv, i) {
  const g = cv.getContext('2d'); const cols = ['#2a1433', '#1d2550', '#f6f1e8', '#ffcf8a'];
  g.fillStyle = cols[i];
  if (i === 3) { g.shadowColor = '#ffb050'; g.shadowBlur = 16; }
  for (let k = 0; k < 9; k++) {
    const x = 40 + (k % 3) * 50 + Math.sin(k * 3) * 10, y = 25 + Math.floor(k / 3) * 32 + Math.cos(k * 2) * 6, s = k === 4 ? 1.4 : 1, wv = Math.sin(k * 1.9);
    g.beginPath(); g.moveTo(x + 14 * s, y); g.lineTo(x + 8 * s, y - 3 * s); g.lineTo(x + 2 * s, y - 2 * s); g.lineTo(x - 5 * s, y - 16 * s * wv); g.lineTo(x - 4 * s, y - 1 * s);
    if (i === 1) { g.lineTo(x - 18 * s, y - 6 * s); g.lineTo(x - 12 * s, y + 0.5 * s); g.lineTo(x - 18 * s, y + 6 * s); }
    else { g.lineTo(x - 11 * s, y - 2 * s); g.lineTo(x - 15 * s, y - 4 * s); g.lineTo(x - 12 * s, y + 1 * s); g.lineTo(x - 15 * s, y + 4 * s); }
    g.lineTo(x - 7 * s, y + 3 * s); g.lineTo(x + 5 * s, y + 3 * s); g.closePath(); g.fill();
  }
}

// ---------- settings toggles ----------
export function refreshToggles() {
  $('tSound').classList.toggle('on', !!S.sound); $('tMusic').classList.toggle('on', !!S.music);
  $('tHaptics').classList.toggle('on', !!S.haptics); $('tQuality').classList.toggle('on', !!S.quality);
}

// ---------- results ----------
export function results(R) {
  $('rKicker').textContent = R.arrived ? 'ARRIVAL' : 'THE FLOCK RESTS';
  const L = LEGS[R.leg % 5];
  $('rLeg').textContent = (R.arrived ? 'Flew all five skies · ' : 'Reached ') + (R.leg >= 5 ? '∞' : L.roman) + ' · ' + L.name;
  ['st1', 'st2', 'st3'].forEach((id, i) => $(id).classList.toggle('on', i < R.stars));
  $('rScore').textContent = R.score.toLocaleString('en-US');
  show('rNew', R.newBest);
  $('rsDist').textContent = Math.floor(R.dist / 10).toLocaleString('en-US') + ' km';
  $('rsLight').textContent = R.light; $('rsStrays').textContent = R.strays; $('rsMax').textContent = R.maxFlock;
  $('rsThread').textContent = R.threads; $('rsHawk').textContent = R.deterred;
  const u = $('rUnlock'); if (R.unlock) { u.textContent = R.unlock; u.classList.remove('hidden'); } else u.classList.add('hidden');
}
