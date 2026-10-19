// Procedural WebAudio: SFX for every event + a bouncy music loop.
let ctx = null, master, sfx, mus, noiseBuf, muted = false, musicOn = false, nextNote = 0, step = 0, timer = 0, paused = false;
try { muted = localStorage.getItem('hole.mute') === '1'; } catch (e) {}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m; try { localStorage.setItem('hole.mute', m ? '1' : '0'); } catch (e) {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended' && !paused) ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
    mus = ctx.createGain(); mus.gain.value = 0.32; mus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
export function pauseAudio() { paused = true; if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resumeAudio() { paused = false; if (ctx && ctx.state === 'suspended') ctx.resume(); }

function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function tone(type, f0, f1, dur, vol, dest = sfx, t = ctx.currentTime) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq, q = 1, type = 'bandpass', dest = sfx, t = ctx.currentTime, f1) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.004, vol, dur); s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

let lastEat = 0, eatCount = 0;
export function sEat(size, combo) {
  if (!ctx || muted) return;
  const now = ctx.currentTime; if (now - lastEat < 0.035) return; lastEat = now; eatCount++;
  const s = Math.min(1, size / 8);
  const base = 900 - s * 760 + Math.min(combo, 20) * 22;
  tone('sine', base, base * 0.45, 0.12 + s * 0.25, 0.22 + s * 0.2);
  tone('triangle', base * 1.5, base * 0.7, 0.07, 0.08);
  if (s > 0.15) noise(0.25 + s * 0.6, 0.12 + s * 0.25, 300 - s * 200, 0.7, 'lowpass');
  if (s > 0.45) tone('sine', 90, 35, 0.6 + s * 0.5, 0.45);
}
export function sCombo(n) {
  if (!ctx || muted) return;
  const notes = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const k = notes[Math.min(notes.length - 1, Math.floor(n / 5))];
  const f = 523.25 * Math.pow(2, k / 12); const t = ctx.currentTime;
  tone('square', f, f, 0.12, 0.05, sfx, t); tone('sine', f * 2, f * 2, 0.2, 0.08, sfx, t + 0.05);
}
export function sLevel() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  noise(0.5, 0.15, 400, 0.8, 'bandpass', sfx, t, 3000);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone('triangle', f, f, 0.18, 0.12, sfx, t + i * 0.06); tone('sine', f * 2, f * 2, 0.1, 0.04, sfx, t + i * 0.06); });
}
export function sEatHole() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  tone('sine', 140, 30, 0.9, 0.7, sfx, t); noise(0.8, 0.4, 900, 0.6, 'lowpass', sfx, t, 120);
  [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone('square', f, f, 0.14, 0.05, sfx, t + 0.15 + i * 0.07));
}
export function sEaten() { if (!ctx || muted) return; const t = ctx.currentTime; tone('sawtooth', 400, 60, 0.9, 0.18, sfx, t); tone('sine', 200, 40, 1.0, 0.3, sfx, t); }
export function sTick(hi) { if (!ctx || muted) return; tone('square', hi ? 1320 : 880, hi ? 1320 : 880, 0.06, 0.07); }
export function sClick() { if (!ctx || muted) return; tone('triangle', 700, 1100, 0.06, 0.12); }
export function sCoin(i = 0) { if (!ctx || muted) return; const t = ctx.currentTime + i * 0.07; tone('square', 1318, 1318, 0.05, 0.05, sfx, t); tone('square', 1760, 1760, 0.12, 0.05, sfx, t + 0.05); }
export function sFanfare(win) {
  if (!ctx || muted) return; const t = ctx.currentTime;
  const seq = win ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5] : [523.25, 493.88, 440, 523.25];
  seq.forEach((f, i) => { tone('triangle', f, f, 0.25, 0.14, sfx, t + i * 0.12); tone('sine', f / 2, f / 2, 0.25, 0.1, sfx, t + i * 0.12); });
}

// ---- music: I–V–vi–IV in C, 116 bpm, kick/hat/clap + bass + pluck arp
const BPM = 116, SPB = 60 / BPM / 4;
const CH = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function schedule() {
  if (!ctx || !musicOn) return;
  while (nextNote < ctx.currentTime + 0.15) {
    const t = nextNote, s = step % 16, bar = Math.floor(step / 16) % 4, ch = CH[bar];
    if (s % 4 === 0) { tone('sine', 150, 40, 0.18, 0.55, mus, t); }
    if (s % 4 === 2) noise(0.04, 0.08, 8000, 1, 'highpass', mus, t);
    if (s === 4 || s === 12) noise(0.12, 0.16, 1500, 0.8, 'bandpass', mus, t);
    if (s % 2 === 0) { const f = mtof(ch[0] - 12 + (s % 8 === 6 ? 7 : 0)); tone('triangle', f, f, SPB * 1.6, 0.22, mus, t); }
    const arp = [0, 1, 2, 1, 2, 0, 1, 2][s % 8]; const f2 = mtof(ch[arp] + 12 + (s >= 8 ? 12 : 0));
    if (s % 2 === 1 || s % 3 === 0) tone('square', f2, f2, SPB * 0.9, 0.04, mus, t);
    nextNote += SPB; step++;
  }
}
export function startMusic() {
  if (!ctx || musicOn) return; musicOn = true; nextNote = ctx.currentTime + 0.05; step = 0;
  clearInterval(timer); timer = setInterval(schedule, 40);
}
export function stopMusic() { musicOn = false; clearInterval(timer); }
