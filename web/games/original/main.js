// MURMUR — boot, game state, input, loop, test hooks.
import { setOrientation, vibrate as hostVibrate, goHome, onBack, onPauseResume, params } from '../../shared/platform.js';
import { mulberry32, clamp, lerp } from './util.js';
import { LEGS, LEG_LEN, updatePalette, P } from './palette.js';
import { LV, resetLevel, spawnAhead, updateLevel, difficulty, floorY, isWaterAt, WATER_Y } from './level.js';
import { F, resetFlock, updateFlock, addBirds, startSplit, endSplit, HAWKS, resetHawks, spawnHawk, updateHawks } from './flock.js';
import { initRender, resize, drawFrame, V, setSpecies } from './render.js';
import { resetFx, updateFx, feathers, sparks, splash, ring } from './fx.js';
import * as A from './audio.js';
import { botThink, resetBot } from './bot.js';
import { S, persist, SPECIES } from './store.js';
import * as UI from './ui.js';

const Q = {
  autoplay: params.get('autoplay') === '1', scene: params.get('scene'), fixed: params.get('fixedstep') === '1',
  warp: parseFloat(params.get('warp') || '0') || 0, seed: params.has('seed') ? (parseInt(params.get('seed'), 10) || 0) : null,
  leg: params.has('leg') ? clamp(parseInt(params.get('leg'), 10) || 0, 0, 4) : null,
};
setOrientation('landscape');

const G = {
  mode: 'boot', t: 0, camX: 0, speed: 30, score: 0, dist: 0, startX: 0, mult: 1, streak: 0, light: 0, strays: 0, threads: 0, deterred: 0,
  flash: 0, hurt: 0, shake: 0, touching: false, hawkT: 8, overT: 0, legSeen: 0, arrived: false, rng: mulberry32(1), bot: false, paused: false,
  deathSfxT: 0, vibT: 0, autoRestart: 0, menuBot: true, lastLegIdx: 0, hintSplitShown: false, hintHawkShown: false, splitHintT: 0,
  causes: {},
};
window.__game = G; G.F = F; G.LV = LV;

const vibrate = ms => { if (S.haptics && !G.bot && userGesture) hostVibrate(ms); };
let userGesture = false;

// ---------------- run control ----------------
function newRun(opts = {}) {
  const seed = Q.seed !== null ? Q.seed : (Date.now() % 100000);
  const leg = opts.leg !== undefined ? opts.leg : S.startLeg;
  G.rng = mulberry32(seed + 1); G.causes = {};
  G.camX = leg * LEG_LEN + (leg > 0 ? 40 : 0); G.startX = G.camX;
  G.score = 0; G.dist = 0; G.mult = 1; G.streak = 0; G.light = 0; G.strays = 0; G.threads = 0; G.deterred = 0;
  G.flash = 0; G.hurt = 0; G.shake = 0; G.hawkT = 9; G.overT = 0; G.arrived = false; G.lastLegIdx = leg; G.t = 0;
  G.speed = speedAt(G.camX);
  resetLevel(seed, G.camX); resetFx(); resetHawks(); resetBot();
  resetFlock(opts.birds || (24 + leg * 4), G.camX, G.rng);
  F.invuln = !!opts.invuln; G.bot = !!opts.bot;
  A.setLeg(leg);
  UI.resetHud();
  spawnAhead(G.camX, V.W);
}
function speedAt(x) { const li = Math.floor(x / LEG_LEN); return 30 + Math.min(li, 4) * 3.5 + Math.max(0, li - 4) * 2 + (x / LEG_LEN - li) * 2.5; }

function startPlay(leg) {
  newRun({ leg, bot: Q.autoplay });
  G.mode = 'play';
  UI.show('menu', false); UI.show('over', false); UI.show('pause', false); UI.show('species', false); UI.show('hud', true);
  const L = LEGS[leg % 5];
  UI.banner(L.roman, L.name, leg === 0 ? 'a migration begins' : 'the flock flies on');
  A.sLeg();
  if (!G.bot) {
    setTimeout(() => { if (G.mode === 'play') UI.hint('drag', 'Drag anywhere to guide the flock', 4200); }, 900);
  }
}
function toMenu() {
  newRun({ leg: S.startLeg, bot: true, invuln: true, birds: 46 });
  G.mode = 'menu';
  UI.show('hud', false); UI.show('over', false); UI.show('pause', false); UI.show('species', false); UI.show('menu', true);
  UI.$('bestTxt').textContent = S.best.toLocaleString('en-US'); UI.$('lightTxt').textContent = S.light.toLocaleString('en-US');
  UI.refreshLegCards(); UI.refreshSpecies();
}
function endRun() {
  G.mode = 'over';
  const legReached = Math.floor(G.camX / LEG_LEN);
  const score = Math.floor(G.score + G.dist);
  const legsFlown = Math.floor((G.camX - Math.floor(G.startX / LEG_LEN) * LEG_LEN) / LEG_LEN);
  const completed = legReached; // absolute legs completed
  const stars = (completed >= 5 ? 3 : completed >= 3 ? 2 : completed >= 1 ? 1 : 0);
  let newBest = false, unlock = '';
  if (!G.bot && !G.testScene) {
    if (score > S.best) { S.best = score; newBest = true; }
    const before = S.light; S.light += G.light;
    for (const sp of SPECIES) if (before < sp.need && S.light >= sp.need) unlock = 'Unlocked · ' + sp.name;
    if (Math.min(4, legReached) > S.legs) { S.legs = Math.min(4, legReached); if (!unlock) unlock = 'New start point · ' + LEGS[S.legs].name; }
    persist('best', 'light', 'legs');
  } else if (G.testScene) { newBest = true; unlock = 'Unlocked · Swallows'; }
  UI.results({ arrived: G.arrived, leg: Math.min(legReached, 5), stars: Math.max(stars, G.testScene ? 2 : 0), score, newBest, dist: G.dist, light: G.light, strays: G.strays, maxFlock: F.maxAlive, threads: G.threads, deterred: G.deterred, unlock });
  UI.show('hud', false); UI.show('over', true);
  A.sOver();
}

// ---------------- simulation ----------------
const cb = {
  onDeath(b, cause) {
    G.causes[cause] = (G.causes[cause] || 0) + 1;
    feathers(b.x, b.y, b.vx, 6);
    if (cause === 'water') splash(b.x, WATER_Y);
    if (G.deathSfxT <= 0) { A.sHit(); G.deathSfxT = 0.07; }
    if (G.vibT <= 0) { vibrate(18); G.vibT = 0.12; }
    G.shake = Math.min(1.2, G.shake + 0.35); G.hurt = Math.min(0.6, G.hurt + 0.18);
    // multiplier drops one tier
    if (G.mode === 'play') { G.streak = Math.max(0, (G.mult - 2) * 8); G.mult = 1 + Math.min(4, Math.floor(G.streak / 8)); }
    if (cause === 'hawk') popupWorld('TAKEN', b.x, b.y - 4, 'bad');
  },
  hawkScreech() { A.sScreech(); },
  hawkDeterred(h) {
    G.deterred++; G.score += 150; A.sDeter(); popupWorld('HAWK SCATTERED  +150', h.x, h.y - 5, 'gold');
  },
};
function popupWorld(text, x, y, cls) {
  if (G.mode !== 'play') return;
  UI.popup(text, clamp((x - G.camX) / V.W, 0.06, 0.94), clamp(y / 100, 0.12, 0.9), cls);
}

function sim(dt) {
  G.t += dt; V.t = G.t;
  G.deathSfxT -= dt; G.vibT -= dt;
  const playing = G.mode === 'play' || G.mode === 'menu';
  if (!playing && G.mode !== 'dying') return;
  const menu = G.mode === 'menu';
  G.speed = lerp(G.speed, speedAt(G.camX) * (menu ? 0.7 : 1), dt * 0.5);
  G.camX += G.speed * dt;
  if (G.mode === 'play') G.dist += G.speed * dt;
  spawnAhead(G.camX, V.W);
  updateLevel(dt, G.t, G.camX, V.W, G.speed, A.audio);
  if (G.bot) botThink(dt, G.camX, V.W, G.speed);
  else keyboardTick(dt);
  updateFlock(dt, G.t, G.camX, G.speed, V.W, cb);
  // hawks
  const li = Math.floor(G.camX / LEG_LEN), leg = LEGS[li % 5];
  if (leg.hawks && !menu && G.mode === 'play') {
    G.hawkT -= dt;
    if (G.hawkT <= 0 && HAWKS.length === 0 && (G.camX / LEG_LEN - li) > 0.06 && (G.camX / LEG_LEN - li) < 0.9) {
      spawnHawk(G.camX, V.W, G.rng); G.hawkT = lerp(13, 7, Math.min(1, difficulty(G.camX))) + G.rng() * 5;
      if (!S.seenHawk && !G.bot) { UI.hint('hawk', 'Hawks hunt stragglers — keep the flock tight', 4200); S.seenHawk = true; persist('seenHawk'); }
    }
  }
  updateHawks(dt, G.camX, G.speed, V.W, cb);
  // motes
  if (F.alive) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const b of F.birds) if (b.alive) { if (b.x < x0) x0 = b.x; if (b.x > x1) x1 = b.x; if (b.y < y0) y0 = b.y; if (b.y > y1) y1 = b.y; }
    for (const m of LV.motes) {
      if (!m.alive || m.x < x0 - 3 || m.x > x1 + 3 || m.y < y0 - 3 || m.y > y1 + 3) continue;
      for (const b of F.birds) {
        if (!b.alive) continue; const dx = b.x - m.x, dy = b.y - m.y;
        if (dx * dx + dy * dy < 7.5) { collectMote(m); break; }
      }
    }
    // strays
    for (const s of LV.strays) {
      if (s.taken) { s.t += dt; continue; }
      if (s.x < x0 - 10 || s.x > x1 + 10) continue;
      for (const b of F.birds) {
        if (!b.alive) continue; const dx = b.x - s.x, dy = b.y - s.y;
        if (dx * dx + dy * dy < 90) {
          s.taken = true; s.t = 0; addBirds(s.n, s.x, s.y, G.rng, G.speed);
          if (G.mode === 'play') { G.strays += s.n; G.score += 25 * s.n; A.sChirp(Math.min(5, s.n)); popupWorld('+' + s.n + ' JOINED', s.x, s.y - 6, 'gold'); ring(s.x, s.y - 1, [255, 255, 255]); vibrate(10); }
          break;
        }
      }
    }
    // perfect thread through arches
    for (const o of LV.obs) {
      if (o.kind !== 'arch' || o.threaded === true || o.failed) continue;
      const lx = F.lead ? F.lead.x : F.cx;
      if (o.lost0 === undefined && lx > o.hole.x0 - 2) o.lost0 = F.lost;
      if (o.lost0 !== undefined && F.cx > o.hole.x1 + 2) {
        const inHole = F.cy > o.hole.y0 && F.cy < o.hole.y1;
        if (inHole && F.lost === o.lost0 && F.alive >= 3) {
          o.threaded = true; if (G.mode === 'play') { G.threads++; G.score += 200 * G.mult; A.sPerfect(); popupWorld('PERFECT THREAD  +' + 200 * G.mult, (o.hole.x0 + o.hole.x1) / 2, o.hole.y0 - 4, 'big gold'); vibrate(12); }
        } else o.failed = true;
      }
    }
    // split tutorial
    if (!G.bot && G.mode === 'play' && !G.hintSplitShown) {
      for (const o of LV.obs) if (o.kind === 'island' && o.minX - G.camX < V.W * 0.9 && o.minX - G.camX > V.W * 0.4) { G.hintSplitShown = true; UI.hint('split', 'Two fingers split the flock', 4200); break; }
    }
  }
  // legs
  const legIdx = Math.floor(G.camX / LEG_LEN);
  if (legIdx > G.lastLegIdx) {
    G.lastLegIdx = legIdx;
    A.setLeg(legIdx);
    if (G.mode === 'play') {
      const L = LEGS[legIdx % 5];
      if (legIdx === 5 && !G.arrived) { G.arrived = true; UI.banner('✦', 'Arrival', 'a new day · the journey goes on'); }
      else UI.banner(legIdx >= 5 ? '∞' : L.roman, L.name, F.alive + ' birds fly on  ·  +' + F.alive * 20);
      G.score += F.alive * 20; A.sLeg();
      if (!G.bot && Math.min(4, legIdx) > S.legs) { S.legs = Math.min(4, legIdx); persist('legs'); }
    }
  }
  // death of the flock
  if (G.mode === 'play' && F.alive === 0) { G.mode = 'dying'; G.overT = 0; }
  if (G.mode === 'dying') { G.overT += dt; if (G.overT > 1.4) { if (G.bot) { G.autoRestart = 0; newRun({ leg: (Math.floor(G.camX / LEG_LEN) + 1) % 5, bot: true }); G.mode = 'play'; } else endRun(); } }
  updateFx(dt, G.speed * 0);
  G.flash = Math.max(0, G.flash - dt * 2.5); G.hurt = Math.max(0, G.hurt - dt * 1.6); G.shake = Math.max(0, G.shake - dt * 3);
  for (const b of LV.bolts) if (b.st === 2 && b.t < dt * 1.5) { G.flash = 0.9; G.shake = Math.max(G.shake, 0.6); }
  // ribbon grows with multiplier
  F.ribbonLen = lerp(F.ribbonLen || 0, (G.mult - 1) * 5 + 4, dt * 2);
  // menu flock never dies
  if (menu && F.alive < 30) addBirds(4, G.camX + 40, 40, G.rng, G.speed);
}
function collectMote(m) {
  m.alive = false;
  if (G.mode !== 'play') { sparks(m.x, m.y, 3, 0.6); return; }
  G.light++; G.streak++; const nm = 1 + Math.min(4, Math.floor(G.streak / 8));
  if (nm > G.mult) { popupWorld('×' + nm, m.x, m.y - 5, 'big gold'); }
  G.mult = nm; G.score += 10 * G.mult;
  sparks(m.x, m.y, 5, 1); A.sMote(G.mult);
}

// ---------------- input ----------------
const ptrs = new Map(); // id -> {x,y,g}
const touchEl = document.getElementById('touch');
const SENS = 1.25;
function unitPerPx() { return 100 / innerHeight; }
touchEl.addEventListener('pointerdown', e => {
  e.preventDefault(); firstGesture();
  if (G.mode !== 'play') return;
  touchEl.setPointerCapture?.(e.pointerId);
  const g = ptrs.size === 0 ? 0 : 1;
  if (g === 1 && [...ptrs.values()].some(p => p.g === 1)) return; // max two
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, g });
  if (g === 1) { startSplit(); A.sSplit(); vibrate(8); }
  G.touching = true; UI.hideHint();
});
touchEl.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p || G.mode !== 'play' || G.bot) return;
  const k = unitPerPx() * SENS; const T = F.targets[F.split ? p.g : 0];
  T.x += (e.clientX - p.x) * k; T.y += (e.clientY - p.y) * k;
  T.x = clamp(T.x, 18, V.W * 0.62); T.y = clamp(T.y, 6, 92);
  p.x = e.clientX; p.y = e.clientY;
});
function ptrUp(e) {
  const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
  if (F.split) {
    if (p.g === 1) endSplit(0);
    else { endSplit(1); for (const q of ptrs.values()) q.g = 0; }
  }
  G.touching = ptrs.size > 0;
}
touchEl.addEventListener('pointerup', ptrUp); touchEl.addEventListener('pointercancel', ptrUp);
// keyboard
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.code); firstGesture();
  if (e.code === 'Escape' || e.code === 'KeyP') { if (G.mode === 'play') pause(); else if (G.mode === 'paused') resume(); }
  if ((e.code === 'Enter') && G.mode === 'menu') startPlay(S.startLeg);
  if (e.code === 'Space' && G.mode === 'play' && !F.split) { startSplit(); A.sSplit(); }
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Space' && F.split && ptrs.size < 2) endSplit(0); });
function keyboardTick(dt) {
  if (G.mode !== 'play') return;
  let dx = 0, dy = 0;
  if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= 1; if (keys.has('ArrowDown') || keys.has('KeyS')) dy += 1;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1; if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
  if (!dx && !dy && !keys.has('Space')) return;
  const T0 = F.targets[0]; T0.x += dx * 70 * dt; T0.y += dy * 70 * dt;
  if (F.split && keys.has('Space')) { const T1 = F.targets[1]; T1.x = T0.x; T1.y = T0.y + 26; T0.y = clamp(T0.y, 6, 66); }
}
function firstGesture() {
  if (!userGesture) { userGesture = true; A.initAudio(); A.setMuted(!S.sound); A.setMusic(S.music); }
  A.startAudio();
}

// ---------------- menus ----------------
function pause() { if (G.mode !== 'play') return; G.mode = 'paused'; UI.$('pauseTitle').textContent = 'PAUSED'; UI.$('btnResume').classList.remove('hidden'); UI.$('btnQuit').classList.remove('hidden'); UI.refreshToggles(); UI.show('pause', true); A.suspendAudio(); }
function resume() { if (G.mode !== 'paused') return; G.mode = 'play'; UI.show('pause', false); A.resumeAudio(); ptrs.clear(); G.touching = false; }
function settingsFromMenu() { G.settingsFromMenu = true; UI.$('pauseTitle').textContent = 'SETTINGS'; UI.$('btnResume').classList.add('hidden'); UI.$('btnQuit').classList.add('hidden'); UI.refreshToggles(); UI.show('pause', true); }
const tap = (id, fn) => UI.$(id).addEventListener('click', e => { firstGesture(); A.sUI(); fn(e); });
tap('btnPlay', () => fade(() => startPlay(S.startLeg)));
tap('btnPause', pause);
tap('btnResume', resume);
tap('btnQuit', () => { UI.show('pause', false); fade(toMenu); });
tap('btnAgain', () => fade(() => startPlay(S.startLeg)));
tap('btnMenu2', () => fade(toMenu));
tap('btnHome', () => goHome());
tap('btnSettings', settingsFromMenu);
tap('btnSpecies', () => { UI.refreshSpecies(); UI.show('species', true); });
tap('btnSpeciesBack', () => UI.show('species', false));
UI.$('pause').addEventListener('click', e => { if (e.target.id === 'pause' && G.settingsFromMenu && G.mode === 'menu') { UI.show('pause', false); G.settingsFromMenu = false; } });
tap('tSound', () => { S.sound = !S.sound; A.setMuted(!S.sound); persist('sound'); UI.refreshToggles(); });
tap('tMusic', () => { S.music = !S.music; A.setMusic(S.music); persist('music'); UI.refreshToggles(); });
tap('tHaptics', () => { S.haptics = !S.haptics; persist('haptics'); UI.refreshToggles(); });
tap('tQuality', () => { S.quality = S.quality ? 0 : 1; V.quality = S.quality; persist('quality'); resize(); UI.refreshToggles(); });
UI.buildLegCards(i => { if (i > S.legs) { UI.popup('Reach ' + LEGS[i].name + ' to start here', 0.75, 0.62); return; } S.startLeg = i; persist('startLeg'); UI.refreshLegCards(); A.sUI(); toMenuKeep(); });
UI.buildSpecies(i => { if (S.light < SPECIES[i].need) return; S.species = i; persist('species'); setSpecies(i); UI.refreshSpecies(); A.sUI(); });
function toMenuKeep() { newRun({ leg: S.startLeg, bot: true, invuln: true, birds: 46 }); }
function fade(fn) { const f = UI.$('fade'); f.classList.add('on'); setTimeout(() => { fn(); f.classList.remove('on'); }, 360); }

onBack(() => {
  if (G.mode === 'play') { pause(); return true; }
  if (G.mode === 'paused') { resume(); return true; }
  if (!UI.$('species').classList.contains('hidden')) { UI.show('species', false); return true; }
  if (!UI.$('pause').classList.contains('hidden')) { UI.show('pause', false); return true; }
  if (G.mode === 'over') { fade(toMenu); return true; }
  return false;
});
onPauseResume(() => { if (G.mode === 'play') pause(); A.suspendAudio(); G.bg = true; }, () => { G.bg = false; if (G.mode !== 'paused') A.resumeAudio(); });
addEventListener('resize', () => resize());

// ---------------- loop ----------------
let last = performance.now(), fpsAcc = 0, fpsN = 0, acc = 0;
const STEP = 1 / 60;
window.__fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0, (now - last) / 1000); last = now;
  fpsAcc += raw; fpsN++; if (fpsAcc > 0.5) { window.__fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (G.bg) return;
  // Deterministic fixed-step accumulator. On a 60 fps phone this is one step a frame; on a
  // slow device (or headless SwiftShader) it catches up in substeps, capped so a long stall
  // can never spiral. ?fixedstep=1 pins exactly one step per rendered frame for screenshots.
  let steps;
  if (Q.fixed) { steps = 1; acc = 0; }
  else { acc = Math.min(acc + raw, 0.5); steps = Math.floor(acc / STEP); acc -= steps * STEP; }
  const dt = STEP;
  if (G.mode !== 'paused' && G.mode !== 'over') { for (let i = 0; i < steps; i++) sim(dt); }
  else if (G.mode === 'over') { G.t += steps * dt * 0.3; V.t = G.t; }
  // camera + shake
  V.camX = G.camX; V.speed = G.speed;
  const sh = G.shake * G.shake * 0.8; V.shakeX = (Math.random() - 0.5) * sh; V.shakeY = (Math.random() - 0.5) * sh;
  updatePalette(G.camX + V.W * 0.25, G.flash);
  const t0 = performance.now(); drawFrame(P, G); window.__drawMs = Math.round(performance.now() - t0);
  if (G.mode === 'play' || G.mode === 'dying') UI.hud(G, F, P);
  A.tickAudio(Math.max(STEP, Math.min(0.5, raw)), G.speed, G.mode === 'play');
}

// ---------------- boot ----------------
V.quality = S.quality; setSpecies(S.species);
initRender(document.getElementById('cv'));
await document.fonts.ready.catch(() => {});
if (Q.autoplay) {
  const leg = Q.leg !== null ? Q.leg : (Q.seed !== null ? Q.seed % 5 : 1);
  newRun({ leg, bot: true, birds: 44 + leg * 4 }); G.mode = 'play';
  UI.show('hud', true);
} else if (Q.scene === 'play') { startPlay(Q.leg !== null ? Q.leg : S.startLeg); }
else if (Q.scene === 'over') {
  newRun({ leg: Q.leg !== null ? Q.leg : 1, bot: true, birds: 40 }); G.mode = 'play'; G.testScene = true;
  for (let t = 0; t < 30; t += 1 / 30) sim(1 / 30);
  G.score += 1800; G.light += 64; G.strays += 17; G.threads += 2; G.deterred += 1;
  endRun();
} else { toMenu(); }
if (Q.warp > 0) { const st = 1 / 30; for (let t = 0; t < Q.warp; t += st) sim(st); }
requestAnimationFrame(frame);
