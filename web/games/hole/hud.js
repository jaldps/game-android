// DOM HUD: hole labels, score popups, leaderboard, timer, combo, banners, results, skins.
import * as THREE from 'three';
import { SKINS, levelRadius, comboTier } from './config.js';
import { store, GOAL_DEFS, dailyGoals, goalLevelProgress } from './store.js';
import { THEMES } from './config.js';

const $ = id => document.getElementById(id);
const _v = new THREE.Vector3();
const labels = new Map();
const pops = [];
let W = window.innerWidth, H = window.innerHeight;
export function hudResize() { W = window.innerWidth; H = window.innerHeight; }

export function project(x, y, z, cam) {
  cam.updateMatrixWorld();
  _v.set(x, y, z).project(cam);
  return [(_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H, _v.z < 1];
}

export function clearLabels() { for (const [, el] of labels) el.remove(); labels.clear(); }
export function updateLabels(holes, cam, leader) {
  for (const h of holes) {
    let el = labels.get(h);
    if (!el) {
      el = document.createElement('div'); el.className = 'hl' + (h.isPlayer ? ' me' : '');
      // one compact pill instead of a three-storey stack
      el.innerHTML = `<div class="pill"><i class="crown"></i><b class="lv"></b><span class="nm"></span></div>`;
      el.querySelector('.nm').textContent = h.name; $('labels').appendChild(el); labels.set(h, el);
      el._lv = el.querySelector('.lv'); el._lvv = -1;
    }
    el.style.setProperty('--c', h.color);
    if (!h.alive) { el.style.display = 'none'; continue; }
    const [sx, sy, vis] = project(h.x, 0.2, h.z - h.r * 1.05, cam);
    if (!vis || sx < -60 || sx > W + 60 || sy < (h.isPlayer ? -40 : 120) || sy > H - 60) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.transform = `translate3d(${sx.toFixed(1)}px,${(sy - 6).toFixed(1)}px,0) translate(-50%,-100%)`;
    if (el._lvv !== h.level) { el._lvv = h.level; el._lv.textContent = 'LV ' + h.level; }
    el.classList.toggle('lead', h === leader);
  }
}

export function popup(text, x, y, z, cam, cls = '') {
  const [sx, sy] = project(x, y, z, cam);
  let p = pops.find(q => !q.alive);
  if (!p) { if (pops.length > 40) return; const el = document.createElement('div'); el.className = 'pp'; $('popups').appendChild(el); p = { el, alive: false }; pops.push(p); }
  // keep popups on screen and out of each other's way
  let px = Math.max(52, Math.min(W - 52, sx + (Math.random() - 0.5) * 18));
  let py = Math.max(140, Math.min(H - 150, sy));
  for (const q of pops) if (q.alive && q.t < 0.4 && Math.abs(q.y - py) < 34 && Math.abs(q.x - px) < 90) py = q.y - 36;
  py = Math.max(130, py);
  p.alive = true; p.t = 0; p.x = px; p.y = py; p.el.textContent = text; p.el.className = 'pp ' + cls; p.el.style.display = '';
}
export function updatePopups(dt) {
  for (const p of pops) {
    if (!p.alive) continue;
    p.t += dt; const t = p.t / 0.95;
    if (t >= 1) { p.alive = false; p.el.style.display = 'none'; continue; }
    const s = t < 0.15 ? 0.5 + t / 0.15 * 0.7 : (t < 0.3 ? 1.2 - (t - 0.15) / 0.15 * 0.2 : 1);
    p.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${(p.y - t * 70).toFixed(1)}px,0) translate(-50%,-50%) scale(${s.toFixed(3)})`;
    p.el.style.opacity = t > 0.7 ? (1 - (t - 0.7) / 0.3).toFixed(2) : '1';
  }
}
export function clearPopups() { for (const p of pops) { p.alive = false; p.el.style.display = 'none'; } }

export function setTimer(sec) {
  const s = Math.max(0, Math.ceil(sec)); const m = Math.floor(s / 60), r = s % 60;
  $('timeTxt').textContent = `${m}:${r < 10 ? '0' : ''}${r}`;
  $('timer').classList.toggle('low', s <= 10);
}
let boardKey = '';
export function updateBoard(holes, player) {
  const sorted = [...holes].sort((a, b) => b.score - a.score);
  const rows = []; const top = sorted.slice(0, 5); const pi = sorted.indexOf(player);
  const row = (h, i) => `<div class="r${h === player ? ' me' : ''}"><span class="n">${i + 1}</span><span class="d" style="background:${h.color}"></span><span class="nm">${h.name}</span><span class="sc">${fmt(h.score)}</span></div>`;
  top.forEach((h, i) => rows.push(row(h, i)));
  if (player && pi >= 5) { rows.push('<div class="sep"></div>'); rows.push(row(player, pi)); }
  const html = rows.join('');
  if (html !== boardKey) { $('board').innerHTML = html; boardKey = html; }
  return sorted;
}
export function fmt(n) { return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
let lastScore = -1;
export function setScore(n) { if (n === lastScore) return; lastScore = n; const el = $('scoreTxt'); el.textContent = fmt(n); el.style.transform = 'scale(1.18)'; clearTimeout(el._t); el._t = setTimeout(() => el.style.transform = '', 90); }
export function setSize(level, prog) { $('lvlTxt').textContent = level; $('sizeArc').style.strokeDashoffset = (113.1 * (1 - prog)).toFixed(1); }

let comboT = 0, comboKey = '';
export function showCombo(n) {
  const t = comboTier(n); if (!t) return;
  const key = t.name;
  const el = $('combo');
  el.innerHTML = `<b style="color:${t.col}">${t.name}</b><span>x${Math.min(n, 99)}</span>`;
  if (key !== comboKey) { comboKey = key; el.classList.remove('on'); void el.offsetWidth; }
  el.classList.add('on'); el.style.opacity = '1'; comboT = 1.0;
}
export function tickCombo(dt) { if (comboT > 0) { comboT -= dt; if (comboT <= 0) { const el = $('combo'); el.classList.remove('on'); comboKey = ''; } } }

// ---------- set-piece objective ----------
let objKey = '';
export function setObjective(def, dist, dir) {
  const el = $('objective');
  if (!def) { if (objKey) { objKey = ''; el.classList.remove('on'); } return; }
  if (def.id !== objKey) { objKey = def.id; el.querySelector('.ot').textContent = def.call; el.classList.add('on'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  el.querySelector('.od').textContent = Math.round(dist) + ' m';
  el.querySelector('.oa').style.transform = `rotate(${(dir * 180 / Math.PI).toFixed(1)}deg)`;
}
export function banner(text, color = '#fff') {
  const el = $('banner'); el.textContent = text; el.style.color = color; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
export function feed(html) {
  const f = $('feed'); const d = document.createElement('div'); d.className = 'f'; d.innerHTML = html; f.appendChild(d);
  while (f.children.length > 3) f.firstChild.remove();
  setTimeout(() => d.remove(), 3200);
}
export function countPop(text) { const el = $('count'); el.textContent = text; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

export function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
export function setCoins() { for (const el of document.querySelectorAll('.coinTxt')) el.textContent = store.coins; }

// ---------- skins ----------
export function skinPreviewCSS(s) {
  switch (s.style) {
    case 1: return `conic-gradient(${s.a},${s.b},${s.a},${s.b},${s.a})`;
    case 2: return `repeating-conic-gradient(${s.a} 0 18deg,${s.b} 18deg 36deg)`;
    case 3: return `repeating-conic-gradient(${s.a} 0 15deg,${s.b} 15deg 30deg)`;
    case 4: return `radial-gradient(circle at 30% 30%,#fff 0 2px,transparent 3px),radial-gradient(circle at 70% 75%,#fff 0 2px,transparent 3px),conic-gradient(${s.a},${s.b},${s.a})`;
    case 5: return `conic-gradient(${s.a},${s.b},${s.a},${s.b},${s.a},${s.b},${s.a})`;
    case 6: return `conic-gradient(${s.a},${s.b},${s.a},${s.b},${s.a})`;
    case 7: return `conic-gradient(#ff3d6e,#ffd23f,#3ddc84,#3dd6ff,#8b6bff,#ff3d6e)`;
    default: return `radial-gradient(circle,${s.b},${s.a} 70%)`;
  }
}
export function renderSkins(onPick) {
  const g = $('skinGrid'); g.innerHTML = '';
  const owned = store.owned, cur = store.skin;
  for (const s of SKINS) {
    const own = owned.includes(s.id);
    const afford = store.coins >= s.price;
    const d = document.createElement('div'); d.className = 'sk' + (s.id === cur ? ' sel' : '') + (own ? '' : afford ? ' afford' : ' locked');
    d.innerHTML = `<div class="pv" style="background:${skinPreviewCSS(s)}"></div><div class="nm">${s.name}</div>` +
      (s.id === cur ? `<div class="eq">EQUIPPED</div>` : own ? `<div class="eq" style="background:#8fd0ff">EQUIP</div>` : `<div class="pr"><span class="coin"></span>${s.price}</div>`);
    d.onclick = () => onPick(s, d);
    g.appendChild(d);
  }
}

// ---------- maps ----------
export const MAP_PRICE = { harbor: 0, sunset: 900, spring: 2200 };
export function renderMaps(onPick) {
  const g = $('mapGrid'); g.innerHTML = '';
  const owned = store.maps, cur = store.map;
  for (const t of THEMES) {
    const own = owned.includes(t.id), price = MAP_PRICE[t.id] || 0;
    const afford = store.coins >= price;
    const d = document.createElement('div');
    d.className = 'mp' + (t.id === cur ? ' sel' : '') + (own ? '' : afford ? ' afford' : ' locked');
    const sk = t.sky, c = v => `rgb(${Math.round(v[0] * 255)},${Math.round(v[1] * 255)},${Math.round(v[2] * 255)})`;
    d.innerHTML = `<div class="pv" style="background:linear-gradient(${c(sk.top)},${c(sk.hor)} 58%,${c(t.grass[1])} 58%,${c(t.grass[0])})"></div>` +
      `<div class="nm">${t.name}</div><div class="sb">${t.sub}</div>` +
      (t.id === cur ? `<div class="eq">SELECTED</div>` : own ? `<div class="eq" style="background:#8fd0ff">PLAY</div>` : `<div class="pr"><span class="coin"></span>${price}</div>`);
    d.onclick = () => onPick(t, price, own);
    g.appendChild(d);
  }
}

// ---------- daily goals ----------
export function renderGoals(where) {
  const el = $(where); if (!el) return;
  const g = dailyGoals();
  const lv = goalLevelProgress();
  el.innerHTML = `<div class="gh"><span>DAILY GOALS</span><span class="lv">LV ${lv.level}<i><u style="width:${(lv.pct * 100).toFixed(0)}%"></u></i></span></div>` +
    GOAL_DEFS.map(d => {
      const p = Math.min(d.target, g.p[d.id] || 0), done = g.done[d.id];
      return `<div class="go${done ? ' done' : ''}"><span class="tk"></span><span class="tx">${d.text.replace('{t}', d.target)}</span>` +
        `<span class="pg">${done ? 'DONE' : p + '/' + d.target}</span><i style="width:${(p / d.target * 100).toFixed(0)}%"></i></div>`;
    }).join('');
}

// ---------- results ----------
export function showResults(sorted, player, coins, balance, onDone) {
  const rank = sorted.indexOf(player) + 1;
  $('rankTxt').textContent = '#' + rank;
  $('rankSub').textContent = rank === 1 ? 'CHAMPION!' : rank <= 3 ? 'PODIUM!' : rank <= 5 ? 'NICE ROUND!' : 'KEEP GROWING!';
  document.querySelector('.rank .crown').style.visibility = rank === 1 ? 'visible' : 'hidden';
  const stars = rank === 1 ? 3 : rank <= 3 ? 2 : 1;
  for (let i = 1; i <= 3; i++) { const el = $('st' + i); el.classList.remove('on'); setTimeout(() => { if (i <= stars) el.classList.add('on'); }, 350 + i * 220); }
  $('standings').innerHTML = sorted.slice(0, 5).concat(rank > 5 ? [player] : []).map((h) => {
    const i = sorted.indexOf(h);
    return `<div class="r${h === player ? ' me' : ''}"><span class="n">${i + 1}</span><span class="d" style="background:${h.color}"></span><span class="nm">${h.name}</span><span class="sc">${h.score}</span></div>`;
  }).join('');
  $('rsScore').textContent = player.score; $('rsEaten').textContent = player.eaten; $('rsHoles').textContent = player.megas || 0; $('rsSize').textContent = player.maxLevel;
  // coin count-up
  const el = $('rsCoins'); let c = 0; const step = Math.max(1, Math.ceil(coins / 30));
  clearInterval(el._t); el.textContent = '0';
  el._t = setInterval(() => { c = Math.min(coins, c + step); el.textContent = c; onDone && onDone(c === coins); if (c >= coins) clearInterval(el._t); }, 40);
  // next unlock progress — always read from the balance the player actually has after this round
  const owned = store.owned, ownedMaps = store.maps;
  const nextSkin = SKINS.find(s => !owned.includes(s.id));
  const nextMap = THEMES.find(t => !ownedMaps.includes(t.id));
  const have = balance;
  let next = null;
  if (nextSkin && nextMap) next = (MAP_PRICE[nextMap.id] <= nextSkin.price) ? { name: nextMap.name + ' map', price: MAP_PRICE[nextMap.id], where: 'MAPS' } : { name: nextSkin.name + ' skin', price: nextSkin.price, where: 'SKINS' };
  else if (nextSkin) next = { name: nextSkin.name + ' skin', price: nextSkin.price, where: 'SKINS' };
  else if (nextMap) next = { name: nextMap.name + ' map', price: MAP_PRICE[nextMap.id], where: 'MAPS' };
  if (next) {
    const pct = Math.min(100, have / next.price * 100);
    $('nextSkin').innerHTML = have >= next.price
      ? `<span style="color:#ffd84a">${next.name} is ready to unlock in ${next.where}!</span><div class="bar"><i style="width:100%"></i></div>`
      : `Next unlock: <b>${next.name}</b> — ${have}/${next.price}<div class="bar"><i style="width:${pct}%"></i></div>`;
  } else $('nextSkin').textContent = 'Everything unlocked — legend!';
  renderGoals('rsGoals');
  return rank;
}
