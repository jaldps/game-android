// Procedural WebAudio: SFX for every event + an upbeat music loop.
let ctx = null, master, sfx, mus, noiseBuf, muted = false, musicOn = false, nextNote = 0, step = 0, timer = 0, paused = false;
try { muted = localStorage.getItem('crowd.mute') === '1'; } catch (e) {}
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m; try { localStorage.setItem('crowd.mute', m ? '1' : '0'); } catch (e) {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended' && !paused) ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.75; sfx.connect(master);
    mus = ctx.createGain(); mus.gain.value = 0.28; mus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
export function pauseAudio() { paused = true; if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resumeAudio() { paused = false; if (ctx && ctx.state === 'suspended') ctx.resume(); }
const ok = () => ctx && !muted && ctx.state === 'running';
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
// recruit pop: pitch climbs with the streak (pentatonic), throttled
let lastPop = 0;
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
export function sRecruit(streak) {
  if (!ok()) return; const now = ctx.currentTime; if (now - lastPop < 0.045) return; lastPop = now;
  const k = PENTA[Math.min(PENTA.length - 1, Math.floor(streak / 3) % PENTA.length)];
  const f = 587.33 * Math.pow(2, k / 12);
  tone('sine', f * 1.5, f, 0.09, 0.16); tone('triangle', f * 2, f * 2, 0.05, 0.05);
}
let lastAbs = 0;
export function sAbsorb() { if (!ok()) return; const now = ctx.currentTime; if (now - lastAbs < 0.06) return; lastAbs = now; tone('square', 330, 520, 0.07, 0.05); noise(0.06, 0.08, 2400, 1.2); }
export function sLose() { if (!ok()) return; const now = ctx.currentTime; if (now - lastAbs < 0.08) return; lastAbs = now; tone('triangle', 300, 160, 0.12, 0.09); }
export function sElim(mine) {
  if (!ok()) return; const t = ctx.currentTime;
  tone('sine', 150, 40, 0.7, 0.6, sfx, t); noise(0.6, 0.35, 1200, 0.7, 'lowpass', sfx, t, 150);
  if (mine) [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { tone('square', f, f, 0.12, 0.06, sfx, t + 0.12 + i * 0.06); tone('sine', f * 2, f * 2, 0.15, 0.05, sfx, t + 0.12 + i * 0.06); });
}
export function sDeath() { if (!ok()) return; const t = ctx.currentTime; tone('sawtooth', 440, 70, 1.0, 0.16, sfx, t); tone('sine', 220, 50, 1.1, 0.3, sfx, t); }
export function sMilestone() { if (!ok()) return; const t = ctx.currentTime; noise(0.4, 0.12, 500, 0.8, 'bandpass', sfx, t, 3500); [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone('triangle', f, f, 0.16, 0.1, sfx, t + i * 0.05)); }
export function sTick(hi) { if (!ok()) return; tone('square', hi ? 1320 : 880, hi ? 1320 : 880, 0.06, 0.07); }
export function sClick() { if (!ok()) return; tone('triangle', 700, 1100, 0.06, 0.12); }
export function sCoin(i = 0) { if (!ok()) return; const t = ctx.currentTime + i * 0.07; tone('square', 1318, 1318, 0.05, 0.05, sfx, t); tone('square', 1760, 1760, 0.12, 0.05, sfx, t + 0.05); }
export function sWhistle() { if (!ok()) return; const t = ctx.currentTime; tone('sine', 1800, 2400, 0.12, 0.12, sfx, t); tone('sine', 2400, 2000, 0.25, 0.12, sfx, t + 0.13); }
export function sFanfare(win) {
  if (!ok()) return; const t = ctx.currentTime;
  const seq = win ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5] : [523.25, 493.88, 440, 392];
  seq.forEach((f, i) => { tone('triangle', f, f, 0.25, 0.14, sfx, t + i * 0.12); tone('sine', f / 2, f / 2, 0.25, 0.1, sfx, t + i * 0.12); });
}
// music: vi–IV–I–V in A minor/C, 124 bpm; four-on-the-floor, offbeat hats, bass, plucks
const BPM = 124, SPB = 60 / BPM / 4;
const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function schedule() {
  if (!ctx || !musicOn) return;
  while (nextNote < ctx.currentTime + 0.15) {
    const t = nextNote, s = step % 16, bar = Math.floor(step / 16) % 4, ch = CH[bar];
    if (s % 4 === 0) tone('sine', 140, 42, 0.2, 0.5, mus, t);
    if (s % 4 === 2) noise(0.05, 0.09, 9000, 1, 'highpass', mus, t);
    if (s === 4 || s === 12) { noise(0.14, 0.14, 1800, 0.7, 'bandpass', mus, t); tone('triangle', 220, 180, 0.08, 0.06, mus, t); }
    if (s % 4 === 0 || s % 4 === 3) { const f = mtof(ch[0] - 24 + (s >= 8 && s % 4 === 3 ? 12 : 0)); tone('triangle', f, f, SPB * 1.8, 0.24, mus, t); }
    const arp = [0, 2, 1, 2, 0, 2, 1, 2][s % 8]; const f2 = mtof(ch[arp] + 12);
    if (s % 2 === 0) tone('square', f2, f2, SPB * 0.8, 0.035, mus, t);
    if (bar === 3 && s >= 12) tone('sine', mtof(ch[2] + 24), mtof(ch[2] + 24), SPB * 0.6, 0.03, mus, t);
    nextNote += SPB; step++;
  }
}
export function startMusic() { if (!ctx || musicOn) return; musicOn = true; nextNote = ctx.currentTime + 0.05; step = 0; clearInterval(timer); timer = setInterval(schedule, 40); }
export function stopMusic() { musicOn = false; clearInterval(timer); }
