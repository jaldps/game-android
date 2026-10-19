// Sinkhole City — game orchestration (menu / play / results), loop, input, hooks.
import * as THREE from 'three';
import { setOrientation, onBack, onPauseResume, goHome, params, vibrate as hostVibrate } from '../../shared/platform.js';
import { ROUND_TIME, SKINS, BOT_NAMES, BOT_COLORS, NUM_BOTS, CITY, HOLE, levelRadius, THEME, applyTheme } from './config.js';
import { seed as seedRng, rand, range, pick } from './rng.js';
import { initRender, frameCamera, resize, R, viewBounds, setupGrade, renderFrame, applyRenderTheme, precompile, CAM } from './render.js';
import { U, flushDamage } from './materials.js';
import { buildCity, P, city, bestSpawn, spawnScrap } from './city.js';
import { objects, writeObject, updateVisibility } from './objects.js';
import { updateCars, updatePeds, respawnLife } from './traffic.js';
import { Hole, holes, events, updateHoles, updateUniforms, clearHoles, setRimSkin, updateOccluders } from './holes.js';
import { makeBrain, updateBrain } from './bots.js';
import { initFx, updateFx, puff, sparkleRing, burst, resetFx, stars, plume, debris, lightShaft } from './fx.js';
import * as A from './audio.js';
import * as H from './hud.js';
import { store, bumpGoal } from './store.js';

const Q = {
  autoplay: params.get('autoplay') === '1', scene: params.get('scene'), seed: parseInt(params.get('seed') || '0', 10) || (Date.now() % 100000),
  fixed: params.get('fixedstep') === '1', warp: parseFloat(params.get('warp') || '0') || 0,
};
const headless = navigator.webdriver === true;
let userGesture = false;
const vibrate = ms => { if (userGesture && !Q.autoplay) hostVibrate(ms); };
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { userGesture = true; }, { capture: true });
setOrientation('portrait');

const G = {
  mode: 'boot', time: 0, roundT: ROUND_TIME, paused: false, player: null, countdown: 0, round: 0, sorted: [],
  popAcc: 0, popT: 0, lastTick: 99, autoRestart: 0, overT: 0,
  slow: 0,        // hit-stop / slow-motion timer (real seconds)
  pullT: 0,       // cinematic camera pull-back timer
  objT: 0,        // objective refresh throttle
};
const $ = id => document.getElementById(id);

// ---------------- world ----------------
function disposeWorld() {
  for (const k in P) { const m = P[k].mesh; if (m) { R.scene.remove(m); m.geometry.dispose(); m.dispose?.(); } }
  clearHoles(R.scene); H.clearLabels(); H.clearPopups(); resetFx();
}
function currentSkin() { return SKINS.find(s => s.id === store.skin) || SKINS[0]; }

function spawnSpots(n) {
  const spots = []; let tries = 0;
  const lim = CITY.SPAN * 0.44;
  while (spots.length < n && tries < 600) {
    tries++;
    // spawn on road intersections / sidewalks so the hole starts with snacks nearby
    const i = Math.floor(rand() * (CITY.NX + 1)), j = Math.floor(rand() * (CITY.NX + 1));
    const x = CITY.X0 + i * CITY.PITCH + CITY.ROAD / 2 + range(-3, 3), z = CITY.X0 + j * CITY.PITCH + CITY.ROAD / 2 + range(-3, 3);
    if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
    if (spots.every(s => Math.hypot(s[0] - x, s[1] - z) > 42 - tries * 0.05)) spots.push([x, z]);
  }
  while (spots.length < n) spots.push([range(-lim, lim), range(-lim, lim)]);
  return spots;
}

function buildWorld(withPlayer) {
  disposeWorld();
  seedRng(Q.seed + G.round * 7919);
  applyTheme(store.map); applyRenderTheme(THEME.cur);
  buildCity(R.scene);
  const nb = withPlayer ? NUM_BOTS : NUM_BOTS + 1;
  const spots = spawnSpots(nb + 1);
  const names = [...BOT_NAMES].sort(() => rand() - 0.5);
  const botSpots = spots.slice(1, nb + 1);
  if (withPlayer) {
    // Fix 6: start the player on a block that still has food, not a bare intersection.
    const s = bestSpawn(botSpots, 36);
    G.player = new Hole(R.scene, { name: 'You', isPlayer: true, skin: currentSkin(), x: s[0], z: s[1] });
    holes.push(G.player);
  } else G.player = null;
  for (let k = 0; k < nb; k++) {
    const s = botSpots[k]; const c = BOT_COLORS[k % BOT_COLORS.length];
    const h = new Hole(R.scene, { name: names[k], skin: { a: c, b: '#ffffff', style: 0 }, x: s[0], z: s[1] });
    h.ai = makeBrain(0.55 + rand() * 0.4);
    holes.push(h);
  }
  if (G.player && Q.autoplay) G.player.ai = makeBrain(1.0);
  updateUniforms();
  H.clearObjective(); G.objT = 0;
  CAM.PULL = 0; G.pullT = 0; G.slow = 0;
  precompile();   // fix 15: never hitch on the first frames of a round
}

// ---------------- simulation ----------------
let respawnClock = 0, realDt = 0;
function sim(dt, fx = true) {
  G.time += dt; U.uTime.value = G.time;
  updateCars(dt, holes); updatePeds(dt, G.time, holes);
  const frozen = G.mode === 'play' && G.countdown > 0;
  for (const h of holes) {
    if (h.ai) updateBrain(h, dt, G.time);
    if (frozen) { h.input.x = 0; h.input.z = 0; }
  }
  if (G.player && !G.player.ai) { G.player.input.x = inp.x; G.player.input.z = inp.z; if (G.mode !== 'play' || frozen) { G.player.input.x = 0; G.player.input.z = 0; } }
  updateHoles(dt, G.time);
  respawnClock -= dt; if (respawnClock <= 0) { respawnClock = 0.4; respawnLife(holes, dt); }
  handleEvents(fx);
  for (const o of objects) if (o.dirty && o.state !== 2) writeObject(o);
  for (const h of holes) h.updateVisual();
  updateUniforms();
  if (G.mode === 'play') {
    if (G.countdown > 0) {
      const before = Math.ceil(G.countdown / 0.8); G.countdown -= fx ? Math.max(dt, realDt) : dt; const after = Math.ceil(G.countdown / 0.8);
      if (fx && after !== before) { if (after > 0) { H.countPop(String(after)); A.sTick(false); } }
      if (G.countdown <= 0 && fx) { H.countPop('GO!'); A.sTick(true); }
    } else {
      G.roundT -= dt;
      const s = Math.ceil(G.roundT);
      if (fx && s <= 10 && s !== G.lastTick && s > 0) { G.lastTick = s; A.sTick(s <= 3); }
      if (G.roundT <= 0) { G.roundT = 0; endRound(fx); }
    }
  }
}

function visibleNear(x, z) { const c = R.camTarget; return Math.hypot(x - c.x, z - c.z) < R.camD * 0.9; }

/** A set-piece going down: the biggest moment in the round. */
function megaSwallowed(o, h, fx) {
  h.megas = (h.megas || 0) + 1;
  if (!fx) return;
  const d = o.megaDef;
  if (h === G.player) {
    H.banner(d.label + ' DOWN!', '#ffd84a');
    H.feed(`You swallowed <b style="color:#ffd84a">${d.label}</b> +${d.value}`);
    G.popAcc += o.value;
    G.slow = 1.15; G.pullT = 2.6; R.shake = 1;
    A.sEatHole(); A.sFanfare(true); vibrate(110);
  } else H.feed(`<span style="color:${h.color}">${h.name}</span> swallowed <b>${d.label}</b>`);
  lightShaft(o.x, o.z, Math.max(5, o.size * 0.75), '#dff2ff', 3.6);
  plume(o.x, o.z, o.size * 0.85, o.size);
  debris(o.x, o.z, o.size * 0.6, o.size);
  stars(o.x, o.z, o.size * 0.8, 16);
  sparkleRing(h.x, h.z, h.r, h.color);
}

function handleEvents(fx) {
  for (const e of events) {
    const h = e.hole;
    // --- world state: must happen even while warping (fx === false) ---
    if (e.type === 'eat') {
      if (e.obj.kind === 'building' || e.obj.kind === 'mega') spawnScrap(e.obj.x, e.obj.z, e.obj.size, h);
      if (e.obj.kind === 'mega') megaSwallowed(e.obj, h, fx);
    }
    if (!fx) continue;
    if (e.type === 'eat') {
      if (visibleNear(e.obj.x, e.obj.z)) {
        puff(h.x + (e.obj.x - h.x) * 0.6, h.z + (e.obj.z - h.z) * 0.6, Math.min(h.r * 0.6, 3), e.obj.size);
        // fix 8: a big thing going down throws up a real dust plume and masonry
        if (e.obj.size > 2.2 && e.obj.kind !== 'mega') {
          plume(e.obj.x, e.obj.z, e.obj.size * 0.8, e.obj.size);
          if (e.obj.size > 3.4) debris(e.obj.x, e.obj.z, e.obj.size * 0.55, e.obj.size);
        }
      }
      if (h === G.player) {
        A.sEat(e.obj.size, h.combo);
        if (e.obj.size > 0.8 || Math.random() < 0.3) stars(h.x, h.z, h.r, Math.min(8, 1 + Math.floor(e.obj.size * 1.5)));
        G.popAcc += e.pts;
        if (e.obj.size > 2.5) { R.shake = Math.min(1, R.shake + e.obj.size * 0.08); vibrate(e.obj.size > 5 ? 40 : 18); }
        if (e.obj.size > 4.2 && e.obj.kind !== 'mega') G.slow = Math.max(G.slow, 0.2);   // hit-stop on the heavy eats
        if (h.combo >= 5 && h.combo % 5 === 0) { H.showCombo(h.combo); A.sCombo(h.combo); }
        else if (h.combo > 5) H.showCombo(h.combo);
      } else if (visibleNear(h.x, h.z) && e.obj.size > 1.5) A.sEat(e.obj.size * 0.6, 0);
    } else if (e.type === 'level') {
      if (h === G.player) { H.banner('SIZE UP!', '#ffe14a'); A.sLevel(); sparkleRing(h.x, h.z, h.targetR, h.color); vibrate(25); R.shake = Math.min(1, R.shake + 0.25); }
    } else if (e.type === 'eatHole') {
      if (visibleNear(e.victim.x, e.victim.z)) burst(e.victim.x, e.victim.z, e.victim.r, e.victim.color);
      if (h === G.player) { H.banner('GULP!', '#7ef0ff'); H.feed(`You swallowed <span style="color:${e.victim.color}">${e.victim.name}</span> +${e.pts}`); A.sEatHole(); R.shake = 1; vibrate(60); G.popAcc += e.pts; }
      else if (e.victim === G.player) { A.sEaten(); vibrate(120); $('respawnBy').innerHTML = `by <span style="color:${h.color}">${h.name}</span>`; H.show('respawn', G.mode === 'play'); }
      else H.feed(`<span style="color:${h.color}">${h.name}</span> swallowed <span style="color:${e.victim.color}">${e.victim.name}</span>`);
    } else if (e.type === 'respawn') {
      if (h === G.player) H.show('respawn', false);
    }
  }
  events.length = 0;
}

// ---------------- flow ----------------
function fade(on) { $('fade').classList.toggle('on', on); }
function biggestHole() { return holes.reduce((a, b) => (b.alive && b.r > a.r ? b : a), holes[0]); }
function showMenu() {
  G.mode = 'menu'; G.paused = false;
  H.show('hud', false); H.show('over', false); H.show('pause', false); H.show('skins', false); H.show('maps', false); H.show('menu', true);
  $('bestTxt').textContent = store.best; $('mapChip').textContent = THEME.cur.name;
  H.setCoins(); H.renderGoals('mnGoals');
  buildWorld(false);
  // fix 12: the backdrop is a real, already-grown hole eating a live block, not a dot on an empty street
  for (const h of holes) { h.level = 9 + Math.floor(rand() * 5); h.r = h.targetR = levelRadius(h.level); h.invuln = 99; h.updateVisual(); }
  for (let t = 0; t < 5; t += 1 / 30) sim(1 / 30, false);
  R.pitch = 41;
  const t = biggestHole();
  frameCamera(t.x, t.z, Math.max(5.2, t.r), 0, true); G.forceCull = true;
}
function startRound(opts = {}) {
  G.round++;
  buildWorld(true);
  G.mode = 'play'; G.paused = false; G.roundT = ROUND_TIME; G.lastTick = 99; G.popAcc = 0; G.autoRestart = 0;
  G.countdown = (Q.autoplay || opts.instant) ? 0 : 2.4;
  H.show('menu', false); H.show('over', false); H.show('pause', false); H.show('skins', false); H.show('maps', false); H.show('respawn', false); H.show('hud', true);
  $('hint').style.opacity = Q.autoplay ? '0' : '1'; hintShown = !Q.autoplay;
  R.pitch = CAM.PITCH;
  frameCamera(G.player.x, G.player.z, G.player.r, 0, true); G.forceCull = true;
  H.setTimer(G.roundT);
  A.startMusic();
}
function endRound(fx) {
  if (G.mode !== 'play') return;
  G.mode = 'over'; G.overT = 0;
  H.clearObjective();
  const p = G.player;
  const sorted = [...holes].sort((a, b) => b.score - a.score); G.sorted = sorted;
  const rank = sorted.indexOf(p) + 1;
  if (Q.autoplay) { G.autoRestart = 3; if (fx) H.banner("TIME'S UP!", '#fff'); return; }
  // Fix 13: a full round pays for roughly a tenth of the catalogue, so the shop lasts.
  // Daily goals are the other half of the economy and reset every day.
  const base = Math.floor(p.score / 18) + [60, 42, 30, 22, 16, 12, 9, 7][Math.min(7, rank - 1)];
  let goalCoins = 0;
  if (!G.testScene) {
    goalCoins += bumpGoal('eat', p.eaten);
    goalCoins += bumpGoal('size', p.maxLevel, true);
    goalCoins += bumpGoal('mega', p.megas || 0);
    if (rank === 1) goalCoins += bumpGoal('win', 1);
    store.xp = store.xp + Math.round(p.score / 12) + (rank === 1 ? 60 : 0);
  }
  const coins = base + goalCoins;
  G.coinsEarned = coins;
  if (!G.testScene) {
    store.coins = store.coins + coins;
    store.best = Math.max(store.best, p.score);
    store.played = store.played + 1;
  }
  // what the player will actually have in hand on the next screen — the unlock bar must agree
  // with the payout it is sitting under (critic fix 13)
  const balance = store.coins + (G.testScene ? coins : 0);
  if (fx) { H.banner("TIME'S UP!", '#fff'); A.sFanfare(rank <= 3); }
  setTimeout(() => {
    if (G.mode !== 'over') return;
    H.show('hud', false); H.show('over', true);
    H.showResults(sorted, p, coins, balance, (done) => { A.sCoin(); });
    H.setCoins();
  }, fx ? 1400 : 0);
}

// ---------------- input ----------------
const inp = { glide: 0, x: 0, z: 0, active: false, ox: 0, oy: 0, id: -1, keys: new Set() };
let hintShown = false;
const JR = 52;
function onDown(e) {
  A.unlock(); if (G.mode === 'play') A.startMusic();
  if (G.mode !== 'play' || G.paused) return;
  inp.active = true; inp.id = e.pointerId; inp.ox = e.clientX; inp.oy = e.clientY; inp.x = inp.z = 0;
  const j = $('joy'); j.style.transform = `translate(${inp.ox}px,${inp.oy}px)`; j.querySelector('.knob').style.transform = ''; j.classList.add('on');
  if (hintShown) { hintShown = false; $('hint').style.opacity = '0'; }
}
function onMove(e) {
  if (!inp.active || e.pointerId !== inp.id) return;
  let dx = e.clientX - inp.ox, dy = e.clientY - inp.oy; const d = Math.hypot(dx, dy);
  if (d > JR) { // drag the joystick base along (relative joystick)
    inp.ox += dx / d * (d - JR); inp.oy += dy / d * (d - JR); dx = e.clientX - inp.ox; dy = e.clientY - inp.oy;
    $('joy').style.transform = `translate(${inp.ox}px,${inp.oy}px)`;
  }
  const dd = Math.hypot(dx, dy);
  const mag = dd < 5 ? 0 : Math.min(1, (dd - 5) / (JR * 0.6 - 5));
  inp.x = dd > 0 ? dx / dd * mag : 0; inp.z = dd > 0 ? dy / dd * mag : 0;
  $('joy').querySelector('.knob').style.transform = `translate(${dx}px,${dy}px)`;
}
function onUp(e) { if (e.pointerId !== inp.id) return; inp.active = false; inp.glide = 0.25; $('joy').classList.remove('on'); }
const touch = $('touch');
touch.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
function keyInput(dt) {
  if (inp.active) return;
  if (inp.glide > 0) { inp.glide -= dt; if (inp.glide <= 0) { inp.x = inp.z = 0; } return; }
  const k = inp.keys; let x = 0, z = 0;
  if (k.has('ArrowLeft') || k.has('KeyA')) x -= 1; if (k.has('ArrowRight') || k.has('KeyD')) x += 1;
  if (k.has('ArrowUp') || k.has('KeyW')) z -= 1; if (k.has('ArrowDown') || k.has('KeyS')) z += 1;
  const l = Math.hypot(x, z); inp.x = l ? x / l : 0; inp.z = l ? z / l : 0;
  if (l && hintShown) { hintShown = false; $('hint').style.opacity = '0'; }
}
window.addEventListener('keydown', e => { A.unlock(); inp.keys.add(e.code); if (e.code === 'Escape' || e.code === 'KeyP') backPressed(); });
window.addEventListener('keyup', e => inp.keys.delete(e.code));

// ---------------- UI wiring ----------------
const click = (id, fn) => $(id).addEventListener('click', (e) => { A.unlock(); A.sClick(); fn(e); });
click('btnPlay', () => { fade(true); setTimeout(() => { startRound(); fade(false); }, 300); });
click('btnHome', () => goHome());
click('btnSkins', () => { openSkins(); });
click('btnSkinsBack', () => { H.show('skins', false); });
click('btnMaps', () => { openMaps(); });
click('btnMapsBack', () => { H.show('maps', false); });
click('btnPause', () => openPause());
click('btnResume', () => closePause());
click('btnSettings', () => openPause(true));
click('btnSound', () => { A.setMuted(!A.isMuted()); syncSettings(); });
click('btnQuality', () => { store.quality = store.quality === 'high' ? 'low' : 'high'; applyQuality(); syncSettings(); });
click('btnQuit', () => { closePause(); A.stopMusic(); fade(true); setTimeout(() => { showMenu(); fade(false); }, 300); });
click('btnAgain', () => { fade(true); setTimeout(() => { startRound(); fade(false); }, 300); });
click('btnMenu2', () => { A.stopMusic(); fade(true); setTimeout(() => { showMenu(); fade(false); }, 300); });

function syncSettings() { $('btnSound').textContent = 'SOUND: ' + (A.isMuted() ? 'OFF' : 'ON'); $('btnQuality').textContent = 'QUALITY: ' + store.quality.toUpperCase(); }
function openPause(settingsOnly = false) {
  if (G.mode === 'play') G.paused = true;
  $('pauseTitle').textContent = settingsOnly ? 'SETTINGS' : 'PAUSED';
  $('btnResume').textContent = settingsOnly ? 'CLOSE' : 'RESUME';
  $('btnQuit').classList.toggle('hidden', settingsOnly);
  syncSettings(); H.show('pause', true);
  inp.active = false; inp.x = inp.z = 0; $('joy').classList.remove('on');
}
function closePause() { H.show('pause', false); G.paused = false; }
function openSkins() {
  H.setCoins();
  const pickSkin = (s) => {
    const owned = store.owned;
    if (owned.includes(s.id)) { store.skin = s.id; A.sClick(); }
    else if (store.coins >= s.price) { store.coins = store.coins - s.price; store.owned = [...owned, s.id]; store.skin = s.id; A.sCoin(); A.sCoin(1); A.sCoin(2); H.setCoins(); }
    else { A.sTick(false); return; }
    if (G.player) setRimSkin(G.player, currentSkin());
    H.renderSkins(pickSkin);
  };
  H.renderSkins(pickSkin); H.show('skins', true);
}
function openMaps() {
  H.setCoins();
  const pickMap = (t, price, owned) => {
    if (owned) { if (t.id === store.map) { H.show('maps', false); return; } store.map = t.id; A.sClick(); }
    else if (store.coins >= price) { store.coins = store.coins - price; store.maps = [...store.maps, t.id]; store.map = t.id; A.sCoin(); A.sCoin(1); H.setCoins(); }
    else { A.sTick(false); return; }
    applyTheme(store.map); applyRenderTheme(THEME.cur);
    $('mapChip').textContent = THEME.cur.name;
    if (G.mode === 'menu') showMenu();          // rebuild the backdrop in the new palette
    H.renderMaps(pickMap); H.show('maps', true);
  };
  H.renderMaps(pickMap); H.show('maps', true);
}
let maxPR = 2;
function applyQuality() {
  const q = store.quality; maxPR = Math.min(window.devicePixelRatio || 1, q === 'low' ? 1.25 : 2);
  R.pr = maxPR; R.renderer.setPixelRatio(R.pr); resize();
  const sm = q === 'low' ? 1024 : 2048; const sh = R.sun.shadow;
  setupGrade(q !== 'low');
  if (sh.mapSize.x !== sm) { sh.mapSize.set(sm, sm); if (sh.map) { sh.map.dispose(); sh.map = null; } }
}
function backPressed() {
  if (!$('skins').classList.contains('hidden')) { H.show('skins', false); return true; }
  if (!$('maps').classList.contains('hidden')) { H.show('maps', false); return true; }
  if (!$('pause').classList.contains('hidden')) { closePause(); return true; }
  if (G.mode === 'play') { openPause(); return true; }
  if (G.mode === 'over') { A.stopMusic(); showMenu(); return true; }
  return false;
}
onBack(backPressed);
onPauseResume(() => { if (G.mode === 'play' && !G.paused) openPause(); A.pauseAudio(); }, () => { A.resumeAudio(); });
window.addEventListener('resize', () => { resize(); H.hudResize(); });

// A soft circular window is punched through whatever stands between the camera and the player's
// hole, instead of screen-dooring whole buildings away (which read as a dot pattern up close).
function updateCutWindow() {
  const p = G.player, c = U.uCut.value;
  if (!p || !p.alive || G.mode === 'menu') { c.w = 0; return; }
  const [sx, sy, vis] = H.project(p.x, 0, p.z, R.camera);
  if (!vis) { c.w = 0; return; }
  const [ex] = H.project(p.x + p.r, 0, p.z, R.camera);
  const pr = R.renderer.getPixelRatio();
  G.holePx = Math.abs(ex - sx);
  const rad = Math.max(40, G.holePx * 1.12 + 20);
  c.set(sx * pr, (window.innerHeight - sy) * pr, rad * pr, 1);
}

// Fix 1: once you are big enough to be in the hunt, the HUD points you at the nearest set-piece.
const OBJ_FROM_LEVEL = 12;
function updateObjective(dt) {
  const p = G.player;
  if (!p || !p.alive || G.mode !== 'play' || p.level < OBJ_FROM_LEVEL) { if (G.objT !== -1) { G.objT = -1; H.clearObjective(); } return; }
  G.objT -= dt; if (G.objT > 0) return;
  G.objT = 0.12;
  let best = null, bestD = 1e9, ready = false;
  for (const m of city.megas) {
    if (m.state !== 0) continue;
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    const fits = p.r * HOLE.FIT > m.size;
    // an edible set-piece always outranks one you are still too small for
    const rankD = fits ? d : d + 4000;
    if (rankD < bestD) { bestD = rankD; best = m; ready = fits; }
  }
  if (!best) { H.clearObjective(); return; }
  H.setObjective(best.megaDef, Math.hypot(best.x - p.x, best.z - p.z), Math.atan2(best.x - p.x, -(best.z - p.z)), ready);
}

// ---------------- loop ----------------
let last = performance.now(), fpsAcc = 0, fpsN = 0, frameMs = 16, adaptT = 0;
let boardT = 0, cullN = 99, dmgT = 0; const VB = {};
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0, (now - last) / 1000); last = now;
  fpsAcc += raw; fpsN++; if (fpsAcc > 0.5) { window.__fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  frameMs += (raw * 1000 - frameMs) * 0.05;
  let dt = Q.fixed ? 1 / 60 : Math.min(raw, 1 / 30); realDt = Math.min(raw, 0.5);
  // hit-stop / slow-motion on the big swallows
  if (G.slow > 0) { G.slow -= realDt; dt *= G.slow > 0 ? 0.34 : 1; }
  keyInput(G.paused ? 1 : dt);
  if (!G.paused) sim(dt);
  if (G.player) updateOccluders(G.player, dt || 1 / 30, R.pitchTan);
  if (++cullN >= 8 || G.forceCull) { cullN = 0; G.forceCull = false; updateVisibility(viewBounds(VB)); for (const k in P) P[k].compact(); }
  for (const k in P) P[k].flush();
  dmgT -= realDt; if (dmgT <= 0) { dmgT = 1 / 12; flushDamage(); }   // 64 KB upload, no need for 60 Hz
  updateFx(G.paused ? 0 : dt);
  // camera — a set-piece collapse pulls the lens back for the beat, then settles
  const pullTo = G.pullT > 0 ? 0.40 : 0;
  if (G.pullT > 0) G.pullT -= realDt;
  CAM.PULL += (pullTo - CAM.PULL) * Math.min(1, realDt * (G.pullT > 0 ? 3.2 : 1.1));
  if (G.mode === 'menu') {
    const t = biggestHole();
    frameCamera(t.x, t.z, Math.max(5.2, t.r), dt);
  } else if (G.player) frameCamera(G.player.x, G.player.z, G.player.r, dt);
  updateCutWindow();
  // HUD
  const lead = holes.reduce((a, b) => (b.score > a.score ? b : a), holes[0]);
  document.getElementById('labels').style.display = G.mode === 'menu' ? 'none' : '';
  if (G.mode !== 'menu') H.updateLabels(holes, R.camera, lead.score > 0 ? lead : null);
  H.updatePopups(G.paused ? 0 : dt); H.tickCombo(dt); updateObjective(G.paused ? 0 : realDt);
  if (G.mode === 'play' || G.mode === 'over') {
    boardT -= dt; if (boardT <= 0) { boardT = 0.25; G.sorted = H.updateBoard(holes, G.player); }
    H.setTimer(G.roundT); H.setScore(G.player.score); H.setSize(G.player.level, G.player.progress);
    G.popT -= dt;
    if (G.popAcc > 0 && G.popT <= 0) {
      const p = G.player; const n = G.popAcc; G.popAcc = 0; G.popT = 0.14;
      // float the number clear of the mouth and of the name tag, so it never covers the pit
      H.popup('+' + n, p.x + range(-0.25, 0.25) * p.r, 1.1, p.z, R.camera,
        n >= 100 ? 'huge' : n >= 20 ? 'big' : '', (G.holePx || 40) + 56);
    }
  }
  if (G.mode === 'over' && Q.autoplay) { G.autoRestart -= dt; if (G.autoRestart <= 0) startRound({ instant: true }); }
  // adaptive resolution (real devices only)
  adaptT += raw;
  if (!headless && adaptT > 2) {
    adaptT = 0;
    if (frameMs > 24 && R.pr > 1) { R.pr = Math.max(1, R.pr - 0.15); R.renderer.setPixelRatio(R.pr); resize(); }
    else if (frameMs < 13 && R.pr < maxPR) { R.pr = Math.min(maxPR, R.pr + 0.1); R.renderer.setPixelRatio(R.pr); resize(); }
  }
  renderFrame();
}

window.__game = {
  get mode() { return G.mode; }, get time() { return G.time; }, get roundT() { return G.roundT; },
  get player() { const p = G.player; return p && { x: p.x, z: p.z, r: p.r, level: p.level, score: p.score, eaten: p.eaten, alive: p.alive }; },
  get holes() { return holes.map(h => ({ name: h.name, level: h.level, r: +h.r.toFixed(2), score: h.score, eaten: h.eaten, holesEaten: h.holesEaten, deaths: h.deaths || 0, alive: h.alive })); },
  get objectsLeft() { return objects.filter(o => o.state === 0).length; },
  get megas() { return city.megas.map(m => ({ id: m.mega, standing: m.state === 0, x: +m.x.toFixed(1), z: +m.z.toFixed(1) })); },
  get map() { return THEME.cur.id; },
  get drawCalls() { return R.renderer.info.render.calls; },
  start: () => startRound({ instant: true }), end: () => endRound(true),
  // same role as ?warp=N, but callable mid-run — the review harness uses it for late-game shots
  simulate(sec) { const st = 1 / 30; for (let t = 0; t < sec; t += st) sim(st, false); return this.holes; },
};

// ---------------- boot ----------------
async function boot() {
  try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch (e) {}
  initRender($('gl'), store.quality); maxPR = R.pr; setupGrade(store.quality !== 'low');
  initFx(R.scene);
  H.hudResize();
  if (Q.autoplay || Q.scene === 'play') startRound({ instant: Q.autoplay });
  else if (Q.scene === 'over') { startRound({ instant: true }); G.player.ai = makeBrain(0.95); G.testScene = true; for (let t = 0; t < 70; t += 1 / 20) sim(1 / 20, false); G.roundT = 0.01; sim(0.02, false); }
  else showMenu();
  if (Q.warp > 0) {
    // Fast-forward silently, then play the last 1.2 s "live" so the first rendered frame shows
    // real particles, popups and banners instead of a sterile frozen state.
    const st = 1 / 30, live = Math.max(0, Q.warp - 1.2);
    for (let t = 0; t < live; t += st) sim(st, false);
    if (G.player) frameCamera(G.player.x, G.player.z, G.player.r, 0, true);
    for (let t = live; t < Q.warp; t += st) sim(st, true);
  }
  if (G.player) frameCamera(G.player.x, G.player.z, G.player.r, 0, true);
  last = performance.now();
  requestAnimationFrame(frame);
}
boot();
