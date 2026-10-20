// Mob Rush — orchestration: menu / play / results, loop, input, hooks.
import * as THREE from 'three';
import { setOrientation, onBack, onPauseResume, goHome, params, vibrate as hostVibrate } from '../../shared/platform.js';
import { ROUND_TIME, SKINS, HATS, CITIES, BOT_NAMES, TEAM_COLORS, GRID, SIM } from './config.js';
import { seed as seedRng, rand, range, shuffle } from './rng.js';
import { initRender, frameCamera, resize, R, viewBounds, setupGrade, renderFrame, applyCityLook } from './render.js';
import { U, setPalette } from './materials.js';
import { buildWorld, W } from './world.js';
import { buildCity } from './citymesh.js';
import { A, teams, S, resetSim, addTeam, spawnNeutrals, seedFollowers, step, upkeep, standings, crowdRadius } from './sim.js';
import { initPeople, updatePeople, setupHats } from './people.js';
import { makeBrain, updateBrain } from './ai.js';
import { initOverlay, resizeOverlay, drawOverlay, addPop, clearPops } from './overlay.js';
import { initFx, updateFx, sparkle, confetti, ring, resetFx } from './fx.js';
import * as AU from './audio.js';
import * as H from './hud.js';
import { store } from './store.js';

const $ = H.$;
const Q = {
  autoplay: params.get('autoplay') === '1', scene: params.get('scene'), seed: parseInt(params.get('seed') || '0', 10) || (Date.now() % 100000),
  fixed: params.get('fixedstep') === '1', warp: parseFloat(params.get('warp') || '0') || 0, city: params.get('city'),
};
const headless = navigator.webdriver === true;
let userGesture = false;
const vibrate = ms => { if (userGesture && !Q.autoplay) hostVibrate(ms); };
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { userGesture = true; AU.unlock(); }, { capture: true });
setOrientation('portrait');

window.__R = R; window.__sim = { A, teams, S };
const G = { mode: 'boot', roundT: ROUND_TIME, paused: false, player: null, countdown: 0, round: 0, cityIdx: 0, menuCity: 0, lastTick: 99, overT: 0, deadT: 0, streak: 0, streakT: 0, popAcc: 0, popT: 0, milestone: 0, autoRestart: 0, stats: null, sorted: [], lastRank: 1 };
window.__game = G;
const MILESTONES = [25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000];

// ---------------- world ----------------
function city() { return CITIES[G.cityIdx]; }
function playerSkin() { return SKINS.find(s => s.id === store.skin) || SKINS[0]; }
function buildRound(withPlayer, cityIdx) {
  G.cityIdx = cityIdx;
  const P = city();
  seedRng(Q.seed + G.round * 7919);
  buildWorld(P.id);
  buildCity(R.scene, P);
  applyCityLook(P); setPalette(P);
  resetSim(); resetFx(); clearPops(); H.resetBoard(); H.clearFeed();
  spawnNeutrals(SIM.NEUTRAL0);
  const spots = W.leaderSpots.slice();
  // choose well-separated spots
  const chosen = [];
  for (const s of spots) { if (chosen.every(c => Math.hypot(c[0] - s[0], c[1] - s[1]) > 60)) chosen.push(s); if (chosen.length >= P.bots + 1) break; }
  for (const s of spots) { if (chosen.length >= P.bots + 1) break; if (!chosen.includes(s)) chosen.push(s); }
  const pskin = playerSkin();
  const cols = TEAM_COLORS.filter(c => c.toLowerCase() !== pskin.color.toLowerCase());
  shuffle(cols);
  const names = shuffle(BOT_NAMES.slice());
  if (withPlayer) {
    G.player = addTeam({ name: 'You', color: pskin.color, isPlayer: true, x: chosen[0][0], z: chosen[0][1], hat: store.hat });
    // autoplay drives the player for the whole round; scene/warp previews need a brain
    // so the warped-in state (and ?scene=over stats) is plausible rather than a dead leader.
    if (Q.autoplay || Q.scene === 'over' || Q.warp > 0) G.player.ai = makeBrain(1.0);
  } else G.player = null;
  const nb = withPlayer ? P.bots : P.bots + 1;
  for (let k = 0; k < nb; k++) {
    const s = chosen[(withPlayer ? 1 : 0) + k];
    const t = addTeam({ name: names[k], color: withPlayer ? cols[k % cols.length] : [pskin.color, ...cols][k % (cols.length + 1)], x: s[0], z: s[1] });
    t.ai = makeBrain(Math.min(1, P.botSkill + range(-0.2, 0.15)));
  }
  setupHats(R.scene);
  G.roundT = ROUND_TIME; G.lastTick = 99; G.streak = 0; G.milestone = 0; G.deadT = 0; G.popAcc = 0;
  G.round++;
}

// ---------------- input ----------------
const inp = { x: 0, z: 0, active: false, ox: 0, oy: 0, id: -1 }, keys = {};
const touch = $('touch'), joy = $('joy'), knob = joy.querySelector('.knob');
touch.addEventListener('pointerdown', e => {
  if (G.mode !== 'play' || G.paused) return;
  inp.active = true; inp.id = e.pointerId; inp.ox = e.clientX; inp.oy = e.clientY; inp.x = 0; inp.z = 0;
  joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px'; joy.classList.add('on'); knob.style.transform = '';
  hideHint();
});
window.addEventListener('pointermove', e => {
  if (!inp.active || e.pointerId !== inp.id) return;
  let dx = e.clientX - inp.ox, dy = e.clientY - inp.oy; const l = Math.hypot(dx, dy); const max = 46;
  if (l > max) { inp.ox += dx * (1 - max / l) * 0.5; inp.oy += dy * (1 - max / l) * 0.5; joy.style.left = inp.ox + 'px'; joy.style.top = inp.oy + 'px'; dx = e.clientX - inp.ox; dy = e.clientY - inp.oy; }
  const ll = Math.hypot(dx, dy); const k = ll < 4 ? 0 : Math.min(1, ll / 26);
  inp.x = ll > 0 ? dx / ll * k : 0; inp.z = ll > 0 ? dy / ll * k : 0;
  const kl = Math.min(ll, max); knob.style.transform = `translate(${ll ? dx / ll * kl : 0}px,${ll ? dy / ll * kl : 0}px)`;
});
const endTouch = e => { if (e.pointerId !== inp.id) return; inp.active = false; inp.id = -1; inp.x = 0; inp.z = 0; joy.classList.remove('on'); };
window.addEventListener('pointerup', endTouch); window.addEventListener('pointercancel', endTouch);
window.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Escape' || e.code === 'KeyP') togglePause(); if (G.mode === 'play') hideHint(); });
window.addEventListener('keyup', e => { keys[e.code] = false; });
function keyInput() {
  let x = 0, z = 0;
  if (keys.KeyA || keys.ArrowLeft) x -= 1; if (keys.KeyD || keys.ArrowRight) x += 1;
  if (keys.KeyW || keys.ArrowUp) z -= 1; if (keys.KeyS || keys.ArrowDown) z += 1;
  const l = Math.hypot(x, z); return l ? [x / l, z / l] : null;
}
let hintShown = false;
function hideHint() { if (!hintShown) return; hintShown = false; $('hint').style.opacity = '0'; setTimeout(() => H.show('hint', false), 500); }

// ---------------- simulation ----------------
function simStep(dt, fx) {
  U.uTime.value += dt;
  const frozen = G.mode === 'play' && G.countdown > 0;
  S.frozen = frozen;
  for (const t of teams) {
    if (!t.alive) { t.inX = 0; t.inZ = 0; continue; }
    if (t.ai) updateBrain(t, dt);
  }
  if (G.player && !G.player.ai && G.player.alive) {
    let x = inp.x, z = inp.z; const k = keyInput(); if (k) [x, z] = k;
    // screen-space drag -> world (camera yaw = 0: screen up = -z)
    G.player.inX = x; G.player.inZ = z;
    if (G.mode !== 'play') { G.player.inX = 0; G.player.inZ = 0; }
  }
  step(dt);
  upkeep(dt, G.mode === 'play' ? 1 - G.roundT / ROUND_TIME : 0.2);
  handleEvents(fx);
  if (G.mode === 'play' && !G.paused) {
    if (G.countdown > 0) {
      const before = Math.ceil(G.countdown / 0.8); G.countdown -= dt; const after = Math.ceil(G.countdown / 0.8);
      if (fx && after !== before) { if (after > 0) { H.countPop(String(after)); AU.sTick(false); } }
      if (G.countdown <= 0 && fx) { H.countPop('GO!'); AU.sWhistle(); }
    } else if (G.deadT <= 0) {
      G.roundT -= dt;
      const s = Math.ceil(G.roundT);
      if (fx && s <= 10 && s !== G.lastTick && s > 0) { G.lastTick = s; AU.sTick(s <= 3); }
      if (G.roundT <= 0) { G.roundT = 0; endRound(fx, false); }
      // last crowd standing
      if (G.player && G.player.alive && teams.filter(t => t.alive).length === 1) endRound(fx, false);
    }
    if (G.deadT > 0) { G.deadT -= dt; if (G.deadT <= 0) endRound(fx, true); }
  }
}

function inView(x, z) { const c = R.camTarget; return Math.abs(x - c.x) < R.camD * 0.6 && Math.abs(z - c.z) < R.camD * 0.9; }
function handleEvents(fx) {
  const ev = S.events;
  if (!fx) { ev.length = 0; return; }
  const P = G.player;
  let gained = 0, gx = 0, gz = 0, gy = 0;
  for (const e of ev) {
    if (e.type === 'join') {
      const t = teams[e.team];
      if (P && e.team === P.id) {
        gained++; gx = e.x; gz = e.z; gy = e.y;
        G.streak++; G.streakT = 0.6;
        if (e.from === -1) AU.sRecruit(G.streak); else AU.sAbsorb();
        if (Math.random() < 0.5) sparkle(e.x, e.y, e.z, t.hex);
        if (e.from >= 0) addPop(e.x, e.y, e.z, '+1', t.hex);
      } else if (P && e.from === P.id) { AU.sLose(); if (Math.random() < 0.4) addPop(e.x, e.y, e.z, '-1', '#ff5d6c'); }
      else if (inView(e.x, e.z) && Math.random() < 0.15) sparkle(e.x, e.y, e.z, t.hex);
    } else if (e.type === 'elim') {
      const dead = teams[e.team], by = teams[e.by];
      if (inView(e.x, e.z)) { confetti(e.x, 0.3, e.z, by.hex, P && e.by === P.id ? 120 : 50); ring(e.x, 0.2, e.z, by.hex, 14); R.shake = Math.min(1.2, R.shake + 0.6); }
      if (P && e.by === P.id) {
        AU.sElim(true); vibrate(60);
        H.banner(`<span style="color:${dead.hex}">${dead.name.toUpperCase()}</span><small>ELIMINATED!</small>`);
        H.setKills(P.kills);
        by.pulse = 1;
      } else if (P && e.team === P.id) {
        AU.sDeath(); vibrate(200); R.shake = 1.5;
        $('deadBy').innerHTML = `Swallowed by <span style="color:${by.hex}">${by.name}</span>'s mob`;
        H.show('dead', true); G.deadT = 2.4;
      } else { AU.sElim(false); }
      H.feed(`<i style="background:${by.hex}"></i>${by.isPlayer ? 'You' : by.name} <span style="opacity:.7">KO'd</span> <i style="background:${dead.hex}"></i>${dead.isPlayer ? 'You' : dead.name}`);
    }
  }
  ev.length = 0;
  if (P && gained) {
    G.popAcc += gained;
    G.popT -= 1;
    if (G.popAcc >= 1 && G.popT <= 0) {
      // aggregate: one popup per few frames
      addPop(gx, gy, gz, '+' + G.popAcc, P.hex, G.popAcc >= 5);
      G.popAcc = 0; G.popT = 3;
    }
    P.pulse = Math.min(1, (P.pulse || 0) + 0.15);
  }
  if (P) {
    const next = MILESTONES[G.milestone];
    if (next && P.count >= next) {
      G.milestone++;
      if (G.mode === 'play') { H.milestone(`${next} MOB!`, P.hex); AU.sMilestone(); R.shake = Math.min(1, R.shake + 0.3); }
    }
  }
}

// ---------------- flow ----------------
function setScreen(name) {
  for (const s of ['menu', 'skins', 'pause', 'over']) H.show(s, s === name);
  H.show('hud', G.mode === 'play' && name !== 'menu' && name !== 'over' && name !== 'skins');
}
function startMenu() {
  G.mode = 'menu'; G.paused = false;
  G.menuCity = Math.max(0, CITIES.findIndex(c => c.id === store.city));
  buildRound(false, G.menuCity);
  // give bots a head start so the backdrop shows crowds
  for (const t of teams) seedFollowers(t, Math.floor(range(30, 140)));
  warp(4);
  setScreen('menu'); refreshMenu();
  AU.stopMusic();
}
function refreshMenu() {
  const c = CITIES[G.menuCity]; const owned = store.cities.includes(c.id);
  H.cityCard(c, owned, store.coins); H.setCoins(store.coins);
  $('bestTxt').textContent = store.best;
}
function switchMenuCity(d) {
  AU.sClick();
  G.menuCity = (G.menuCity + d + CITIES.length) % CITIES.length;
  const c = CITIES[G.menuCity];
  if (store.cities.includes(c.id)) store.city = c.id;
  fade(() => { buildRound(false, G.menuCity); for (const t of teams) seedFollowers(t, Math.floor(range(30, 140))); warp(3); refreshMenu(); });
}
function startPlay() {
  const c = CITIES[G.menuCity];
  if (!store.cities.includes(c.id)) {
    if (store.coins >= c.price) { store.coins -= c.price; store.cities = [...store.cities, c.id]; store.city = c.id; AU.sCoin(); AU.sCoin(1); refreshMenu(); }
    else { AU.sLose(); return; }
    return;
  }
  AU.sClick();
  fade(() => {
    G.mode = 'play'; G.paused = false;
    buildRound(true, G.menuCity);
    G.countdown = Q.autoplay || Q.scene === 'play' ? 0 : 2.4;
    setScreen('hud'); H.show('hud', true); H.show('dead', false);
    hintShown = !Q.autoplay; H.show('hint', hintShown); $('hint').style.opacity = '1';
    H.setKills(0);
    AU.startMusic();
    frameNow(true);
  });
}
function endRound(fx, died) {
  if (G.mode !== 'play') return;
  G.mode = 'over';
  const list = standings(); const P = G.player;
  G.sorted = list;
  const rank = P.rank, alive = P.alive;
  const stars = !alive ? (rank <= 3 ? 1 : 0) : rank === 1 ? 3 : rank <= 3 ? 2 : rank <= 5 ? 1 : 0;
  const coins = Math.floor(P.maxCount / 6) + [80, 50, 35, 20, 12, 8, 5, 3, 2, 1][rank - 1] + P.kills * 15;
  G.stats = { rank, stars, coins, crowd: alive ? P.count : 0, max: P.maxCount, rec: P.recruits, kills: P.kills, died };
  if (Q.autoplay) { G.autoRestart = 3.5; H.show('dead', false); return; }
  store.coins += coins; store.played += 1; if (rank === 1 && alive) store.wins += 1;
  if (P.maxCount > store.best) store.best = P.maxCount;
  AU.stopMusic();
  setTimeout(() => showResults(), died ? 200 : 900);
  if (!died && fx) H.banner(rank === 1 ? 'YOU WIN!' : "TIME'S UP!");
}
function showResults() {
  const st = G.stats; const P = G.player;
  H.show('dead', false);
  $('overHead').textContent = st.died ? 'ABSORBED!' : (st.rank === 1 ? 'VICTORY!' : "TIME'S UP!");
  $('medal').innerHTML = H.medalSVG(st.rank);
  $('rRank').textContent = '#' + st.rank;
  $('rSub').textContent = st.rank === 1 ? (st.died ? 'SO CLOSE!' : 'CHAMPION!') : st.rank <= 3 ? 'GREAT RUN!' : st.died ? 'TRY AGAIN!' : 'NICE TRY!';
  for (let k = 1; k <= 3; k++) { const el = $('st' + k); el.classList.remove('on'); if (k <= st.stars) setTimeout(() => { el.classList.add('on'); AU.sCoin(k); }, 300 + k * 260); }
  let h = '';
  for (const t of G.sorted.slice(0, 6)) h += `<div class="s${t === P ? ' me' : ''}${t.alive ? '' : ' dead'}"><span class="n">${t.rank}</span><span class="d" style="background:${t.hex}"></span><span class="nm">${t.isPlayer ? 'You' : t.name}</span><span class="sc">${t.alive ? t.count : 'KO'}</span></div>`;
  if (!G.sorted.slice(0, 6).includes(P)) h += `<div class="s me${P.alive ? '' : ' dead'}"><span class="n">${P.rank}</span><span class="d" style="background:${P.hex}"></span><span class="nm">You</span><span class="sc">${P.alive ? P.count : 'KO'}</span></div>`;
  $('standings').innerHTML = h;
  $('rsCrowd').textContent = st.crowd; $('rsMax').textContent = st.max; $('rsRec').textContent = st.rec; $('rsKills').textContent = st.kills;
  // count-up coins
  const el = $('rsCoins'); let v = 0; const tgt = st.coins; const t0 = performance.now();
  const tick = () => { const u = Math.min(1, (performance.now() - t0) / 900); v = Math.round(tgt * (1 - Math.pow(1 - u, 3))); el.textContent = v; if (u < 1) requestAnimationFrame(tick); };
  tick();
  // next unlock
  const next = [...SKINS.map(s => ({ ...s, kind: 'color', own: store.owned.includes(s.id) })), ...HATS.map(s => ({ ...s, kind: 'hat', own: store.hats.includes(s.id) })), ...CITIES.map(c => ({ ...c, kind: 'city', own: store.cities.includes(c.id) }))]
    .filter(s => !s.own).sort((a, b) => a.price - b.price)[0];
  if (next) { const pct = Math.min(100, store.coins / next.price * 100); $('nextUnlock').innerHTML = `${store.coins >= next.price ? 'READY TO UNLOCK' : 'NEXT UNLOCK'}: ${next.name.toUpperCase()} ${next.kind === 'city' ? '(CITY)' : next.kind === 'hat' ? '(HAT)' : '(COLOR)'} · ${store.coins}/${next.price}<div class="bar"><i style="width:${pct}%"></i></div>`; }
  else $('nextUnlock').textContent = 'EVERYTHING UNLOCKED!';
  setScreen('over'); H.show('hud', false);
  AU.sFanfare(st.rank <= 3 && !st.died);
  if (st.rank === 1 && !st.died) confetti(A.x[P.leader], 0, A.z[P.leader], P.hex, 150);
}
function togglePause(force) {
  if (G.mode !== 'play') return;
  G.paused = force ?? !G.paused;
  H.show('pause', G.paused);
  if (G.paused) { AU.stopMusic(); inp.active = false; joy.classList.remove('on'); } else AU.startMusic();
  refreshPause();
}
function refreshPause() { $('btnSound').textContent = 'SOUND: ' + (AU.isMuted() ? 'OFF' : 'ON'); $('btnQuality').textContent = 'QUALITY: ' + store.quality.toUpperCase(); }
function fade(fn) { const f = $('fade'); f.classList.add('on'); setTimeout(() => { fn(); requestAnimationFrame(() => f.classList.remove('on')); }, headless ? 0 : 340); }

// ---------------- skins ----------------
let skinTab = 'color';
function openSkins() { AU.sClick(); renderSkins(); setScreen('skins'); }
function renderSkins() {
  $('tabCol').classList.toggle('on', skinTab === 'color'); $('tabHat').classList.toggle('on', skinTab === 'hat');
  const coins = store.coins; let h = '';
  if (skinTab === 'color') {
    const owned = store.owned;
    for (const s of SKINS) { const own = owned.includes(s.id), sel = store.skin === s.id; h += `<button class="sk${sel ? ' sel' : ''}${own ? '' : ' locked'}${!own && coins < s.price ? ' cant' : ''}" data-id="${s.id}">${H.personSVG(s.color, sel ? store.hat : null)}<span>${s.name}</span>${own ? (sel ? '<span class="eq">✓</span>' : '<span class="pr">OWNED</span>') : `<span class="pr"><span class="coin"></span>${s.price}</span>`}</button>`; }
  } else {
    const owned = store.hats; const col = playerSkin().color;
    for (const s of HATS) { const own = owned.includes(s.id), sel = store.hat === s.id; h += `<button class="sk${sel ? ' sel' : ''}${own ? '' : ' locked'}${!own && coins < s.price ? ' cant' : ''}" data-id="${s.id}">${H.personSVG(col, s.id)}<span>${s.name}</span>${own ? (sel ? '<span class="eq">✓</span>' : '<span class="pr">OWNED</span>') : `<span class="pr"><span class="coin"></span>${s.price}</span>`}</button>`; }
  }
  $('skinGrid').innerHTML = h; H.setCoins(store.coins);
  for (const b of $('skinGrid').querySelectorAll('.sk')) b.onclick = () => pickSkin(b.dataset.id);
}
function pickSkin(id) {
  const isCol = skinTab === 'color'; const list = isCol ? SKINS : HATS; const s = list.find(q => q.id === id);
  const owned = isCol ? store.owned : store.hats;
  if (owned.includes(id)) { if (isCol) store.skin = id; else store.hat = id; AU.sClick(); }
  else if (store.coins >= s.price) { store.coins -= s.price; if (isCol) { store.owned = [...owned, id]; store.skin = id; } else { store.hats = [...owned, id]; store.hat = id; } AU.sCoin(); AU.sCoin(1); }
  else { AU.sLose(); return; }
  renderSkins();
}

// ---------------- buttons ----------------
const tap = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); fn(); });
tap('btnPlay', startPlay);
tap('cityPrev', () => switchMenuCity(-1)); tap('cityNext', () => switchMenuCity(1));
tap('btnSkins', openSkins);
tap('btnSkinsBack', () => { AU.sClick(); setScreen('menu'); refreshMenu(); });
tap('tabCol', () => { skinTab = 'color'; AU.sClick(); renderSkins(); }); tap('tabHat', () => { skinTab = 'hat'; AU.sClick(); renderSkins(); });
tap('btnHome', () => goHome());
tap('btnSettings', () => { AU.sClick(); G.paused = false; H.show('pause', true); $('pauseTitle').textContent = 'SETTINGS'; $('btnResume').textContent = 'CLOSE'; H.show('btnQuit', false); refreshPause(); });
tap('btnPause', () => { AU.sClick(); $('pauseTitle').textContent = 'PAUSED'; $('btnResume').textContent = 'RESUME'; H.show('btnQuit', true); togglePause(true); });
tap('btnResume', () => { AU.sClick(); if (G.mode === 'play') togglePause(false); else H.show('pause', false); });
tap('btnSound', () => { AU.setMuted(!AU.isMuted()); AU.sClick(); refreshPause(); });
tap('btnQuality', () => { store.quality = store.quality === 'high' ? 'low' : 'high'; applyQuality(); refreshPause(); AU.sClick(); });
tap('btnQuit', () => { AU.sClick(); G.paused = false; H.show('pause', false); fade(startMenu); });
tap('btnMenu2', () => { AU.sClick(); fade(startMenu); });
tap('btnAgain', () => { AU.sClick(); G.menuCity = G.cityIdx; startPlay(); });
onBack(() => {
  if (!$('pause').classList.contains('hidden')) { if (G.mode === 'play') togglePause(false); else H.show('pause', false); return true; }
  if (G.mode === 'play') { $('pauseTitle').textContent = 'PAUSED'; $('btnResume').textContent = 'RESUME'; H.show('btnQuit', true); togglePause(true); return true; }
  if (!$('skins').classList.contains('hidden')) { setScreen('menu'); refreshMenu(); return true; }
  if (G.mode === 'over') { fade(startMenu); return true; }
  return false;
});
let bgPaused = false;
onPauseResume(() => { bgPaused = true; AU.pauseAudio(); if (G.mode === 'play' && !G.paused && !Q.autoplay) togglePause(true); }, () => { bgPaused = false; AU.resumeAudio(); });

function applyQuality() {
  const q = store.quality; R.quality = q;
  R.pr = Math.min(window.devicePixelRatio || 1, q === 'low' ? 1.25 : 2); R.renderer.setPixelRatio(R.pr); resize();
  setupGrade(q === 'high');
  R.renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; R.renderer.shadowMap.needsUpdate = true;
}

// ---------------- camera ----------------
const vb = { x0: 0, x1: 0, z0: 0, z1: 0 };
let menuYaw = 0;
function frameNow(snap, dt = 1 / 60) {
  if (G.mode === 'menu') {
    // follow the biggest crowd with a slow orbit
    let big = teams[0]; for (const t of teams) if (t.alive && t.count > big.count) big = t;
    const L = big.leader; menuYaw += dt * 0.06; R.yaw = Math.sin(menuYaw) * 0.5; R.pitch = 46;
    frameCamera(A.x[L], 0, A.z[L] + 6, 22 + crowdRadius(big.count) * 2.4, dt, snap);
    return;
  }
  R.yaw = 0; R.pitch = 52;
  const P = G.player || teams[0]; const L = P.leader;
  let want = 11.5 + crowdRadius(P.count) * 3.5;
  if (G.mode === 'over' && G.stats) want *= 1.15;
  frameCamera(A.x[L], A.y[L] > 2 ? A.y[L] * 0.6 : 0, A.z[L], want, dt, snap);
}

// ---------------- loop ----------------
function warp(sec) { const n = Math.round(sec * 30); for (let k = 0; k < n; k++) simStep(1 / 30, false); }
let last = performance.now(), fpsAcc = 0, fpsN = 0, slowT = 0;
window.__fps = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let realDt = Math.min(0.1, (now - last) / 1000); last = now;
  fpsAcc += realDt; fpsN++; if (fpsAcc > 0.5) { window.__fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (bgPaused) return;
  let dt = Q.fixed ? 1 / 60 : Math.min(realDt, 1 / 30);
  const running = !(G.mode === 'play' && G.paused);
  if (running) {
    if (dt > 1 / 45) { simStep(dt / 2, true); simStep(dt / 2, true); } else simStep(dt, true);
  }
  if (G.streakT > 0) { G.streakT -= realDt; if (G.streakT <= 0) G.streak = 0; }
  if (G.mode === 'over' && Q.autoplay) { G.autoRestart -= realDt; if (G.autoRestart <= 0) { G.mode = 'play'; buildRound(true, G.cityIdx); G.countdown = 0; warp(20); H.show('dead', false); frameNow(true); } }
  frameNow(false, realDt);
  viewBounds(vb, 2); S.view = vb;
  updatePeople(vb, U.uTime.value);
  updateFx(realDt);
  // HUD
  if (G.mode === 'play' || (G.mode === 'over' && Q.autoplay)) {
    const list = standings(); const P = G.player;
    H.updateBoard(list, P); H.setTime(G.roundT);
    if (P) H.setCount(P.alive ? P.count : 0, P.rank, P.hex);
  }
  drawOverlay(realDt, { labels: G.mode !== 'boot', safeTop: G.mode === 'menu' ? 40 : 150, safeBot: G.mode === 'menu' ? 260 : 90 });
  renderFrame();
  // adaptive resolution (real devices only)
  if (!headless && store.quality === 'high') {
    if (realDt > 0.026) slowT += realDt; else slowT = Math.max(0, slowT - realDt * 0.5);
    if (slowT > 2.5 && R.pr > 1.1) { R.pr = Math.max(1, R.pr - 0.25); R.renderer.setPixelRatio(R.pr); resize(); setupGrade(true); slowT = 0; }
  }
}

// ---------------- boot ----------------
async function boot() {
  initRender($('gl'), store.quality);
  setupGrade(store.quality === 'high');
  initOverlay($('ov'));
  initPeople(R.scene, store.quality === 'low');
  initFx(R.scene);
  window.addEventListener('resize', () => { resize(); resizeOverlay(); if (R.grade) setupGrade(true); });
  try { await document.fonts.ready; } catch (e) {}
  H.setCoins(store.coins); AU.setMuted(AU.isMuted());
  if (Q.city) { const i = CITIES.findIndex(c => c.id === Q.city); if (i >= 0) { store.city = CITIES[i].id; } }
  const sc = Q.autoplay ? 'play' : Q.scene;
  if (sc === 'play' || sc === 'over') {
    G.menuCity = Math.max(0, CITIES.findIndex(c => c.id === (Q.city || store.city)));
    if (!store.cities.includes(CITIES[G.menuCity].id)) G.menuCity = Q.city ? G.menuCity : 0;
    G.mode = 'play'; buildRound(true, G.menuCity); G.countdown = 0;
    setScreen('hud'); H.show('hud', true); H.setKills(0);
    hintShown = false; H.show('hint', false);
    const w = Q.warp || (sc === "over" ? 70 : Q.autoplay ? 20 : 0);
    if (w) { G.roundT = ROUND_TIME; warp(Math.min(w, ROUND_TIME - 5)); }
    // hand control back to the human once the preview warp is done
    if (!Q.autoplay && G.player) G.player.ai = null;
    if (sc === 'over') {
      if (!G.player.alive) G.player.alive = true;
      G.roundT = 0; G.mode = 'play'; endRoundPreview();
    }
  } else startMenu();
  frameNow(true);
  requestAnimationFrame(t => { last = t; loop(t); });
}
// results preview for ?scene=over (does not touch persistence)
function endRoundPreview() {
  G.mode = 'over';
  const list = standings(); const P = G.player; G.sorted = list;
  const rank = P.rank; const stars = rank === 1 ? 3 : rank <= 3 ? 2 : rank <= 5 ? 1 : 0;
  G.stats = { rank, stars, coins: Math.floor(P.maxCount / 6) + [80, 50, 35, 20, 12, 8, 5, 3, 2, 1][rank - 1] + P.kills * 15, crowd: P.count, max: P.maxCount, rec: P.recruits, kills: P.kills, died: false };
  showResults();
}
boot();
