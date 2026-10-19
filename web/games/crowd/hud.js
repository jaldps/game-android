// DOM HUD + screens.
import { SKINS, HATS, CITIES } from './config.js';
const $ = id => document.getElementById(id);
export { $ };

let boardKey = '';
export function updateBoard(list, player) {
  const top = list.slice(0, 5);
  const showMe = player && !top.includes(player);
  const key = top.map(t => t.id + ':' + t.count + ':' + t.alive).join('|') + (showMe ? '|me' + player.rank + ':' + player.count : '');
  if (key === boardKey) return; boardKey = key;
  let h = '';
  const row = t => `<div class="r${t === player ? ' me' : ''}${t.alive ? '' : ' dead'}"><span class="n">${t.rank}</span><span class="d" style="background:${t.hex}"></span><span class="nm">${t.isPlayer ? 'You' : t.name}</span><span class="sc">${t.alive ? t.count : 'KO'}</span></div>`;
  for (const t of top) h += row(t);
  if (showMe) h += '<div class="sep"></div>' + row(player);
  $('board').innerHTML = h;
}
export function resetBoard() { boardKey = ''; }
let lastTime = '';
export function setTime(s) {
  const v = Math.max(0, Math.ceil(s)); const txt = Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0');
  if (txt !== lastTime) { $('timeTxt').textContent = txt; lastTime = txt; }
  $('timer').classList.toggle('low', v <= 10);
}
let lastCount = -1, bumpT = 0;
export function setCount(n, rank, color) {
  if (n !== lastCount) { $('countTxt').textContent = n; if (n > lastCount) { const el = $('countTxt'); el.classList.add('bump'); clearTimeout(bumpT); bumpT = setTimeout(() => el.classList.remove('bump'), 90); } lastCount = n; }
  $('rankTxt').textContent = '#' + rank;
  $('mycount').style.setProperty('--team', color);
}
export function setKills(n) { $('killTxt').textContent = n; }
export function banner(html) { const b = $('banner'); b.innerHTML = html; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
let msT = 0;
export function milestone(html, color) { const m = $('milestone'); m.innerHTML = html; m.style.color = color || '#fff'; m.classList.add('on'); clearTimeout(msT); msT = setTimeout(() => m.classList.remove('on'), 1400); }
export function feed(html) {
  const f = $('feed'); const d = document.createElement('div'); d.className = 'f'; d.innerHTML = html; f.prepend(d);
  while (f.children.length > 3) f.lastChild.remove();
  setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 450); }, 2600);
}
export function clearFeed() { $('feed').innerHTML = ''; }
export function countPop(t) { const c = $('count'); c.textContent = t; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
export function show(id, on) { $(id).classList.toggle('hidden', !on); }
export function setCoins(n) { for (const el of document.querySelectorAll('.coinTxt')) el.textContent = n; }

// person icon for skin cards
export function personSVG(color, hat) {
  const hats = {
    none: '<path d="M20 9l3 4 5-5 5 5 3-4-1 8H21z" fill="#ffcc19" stroke="#1b2140" stroke-width="1.5" stroke-linejoin="round"/>',
    cap: '<path d="M19 15a9 7 0 0 1 18 0z" fill="#ff4757" stroke="#1b2140" stroke-width="1.5"/><rect x="31" y="13" width="9" height="3" rx="1.5" fill="#ff4757" stroke="#1b2140" stroke-width="1.2"/>',
    tophat: '<rect x="21" y="2" width="14" height="12" rx="1" fill="#22252e"/><rect x="17" y="13" width="22" height="3" rx="1.5" fill="#22252e"/><rect x="21" y="10" width="14" height="2.5" fill="#e03131"/>',
    party: '<path d="M22 15l6-14 6 14z" fill="#ff6bcb" stroke="#1b2140" stroke-width="1.5" stroke-linejoin="round"/><circle cx="28" cy="2" r="2.5" fill="#ffe066"/>',
    viking: '<path d="M19 16a9 8 0 0 1 18 0z" fill="#adb5bd" stroke="#1b2140" stroke-width="1.5"/><path d="M19 13l-5-7 2 9z M37 13l5-7-2 9z" fill="#fff4d6" stroke="#1b2140" stroke-width="1.2"/>',
    halo: '<ellipse cx="28" cy="5" rx="9" ry="3" fill="none" stroke="#ffd23f" stroke-width="3"/>',
  };
  return `<svg viewBox="0 0 56 56"><ellipse cx="28" cy="52" rx="12" ry="3" fill="rgba(27,33,64,.2)"/>
  <rect x="20.5" y="36" width="6" height="15" rx="3" fill="${color}" stroke="#1b2140" stroke-width="1.6" style="filter:brightness(.8)"/><rect x="29.5" y="36" width="6" height="15" rx="3" fill="${color}" stroke="#1b2140" stroke-width="1.6" style="filter:brightness(.8)"/>
  <rect x="13" y="25" width="5" height="14" rx="2.5" fill="${color}" stroke="#1b2140" stroke-width="1.6" transform="rotate(12 15 25)"/><rect x="38" y="25" width="5" height="14" rx="2.5" fill="${color}" stroke="#1b2140" stroke-width="1.6" transform="rotate(-12 41 25)"/>
  <rect x="18" y="23" width="20" height="18" rx="9" fill="${color}" stroke="#1b2140" stroke-width="1.8"/>
  <circle cx="28" cy="17" r="8" fill="${color}" stroke="#1b2140" stroke-width="1.8"/><circle cx="25" cy="15" r="2.2" fill="rgba(255,255,255,.55)"/>
  ${hat ? hats[hat] || '' : ''}</svg>`;
}
export function medalSVG(rank) {
  const c = rank === 1 ? ['#ffe36a', '#f2a900', '#c47f00'] : rank === 2 ? ['#f1f4fa', '#b8c2d6', '#8794ad'] : rank === 3 ? ['#ffc28a', '#d9822b', '#a85a14'] : ['#dfe5f2', '#aab4c8', '#7d88a0'];
  return `<svg viewBox="0 0 96 96"><path d="M30 4h14l8 30H38z" fill="#ff5d6c"/><path d="M66 4H52l-8 30h14z" fill="#3aa0ff"/>
  <circle cx="48" cy="58" r="32" fill="${c[2]}"/><circle cx="48" cy="56" r="30" fill="${c[1]}"/><circle cx="48" cy="56" r="23" fill="${c[0]}" stroke="${c[2]}" stroke-width="2"/>
  <text x="48" y="66" text-anchor="middle" font-family="Lilita One" font-size="28" fill="${c[2]}">${rank <= 3 ? rank : rank}</text>
  <path d="M30 40a24 24 0 0 1 14-8" stroke="rgba(255,255,255,.7)" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
}
export function cityCard(city, owned, coins) {
  $('cityName').textContent = city.name;
  const sel = document.querySelector('.citysel');
  sel.classList.toggle('locked', !owned);
  $('cityInfo').innerHTML = owned ? `${city.bots} rivals · ${['Easy', 'Medium', 'Hard'][CITIES.indexOf(city)]}` : `LOCKED · <span class="coin"></span>${city.price}${coins >= city.price ? ' — TAP PLAY TO BUY' : ''}`;
  $('btnPlay').textContent = owned ? 'PLAY' : (coins >= city.price ? 'UNLOCK' : 'LOCKED');
}
