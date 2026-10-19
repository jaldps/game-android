// Procedural audio: generative ambient pads per leg, wind bed, and tactile synth SFX.
// Mote pickups play notes of the current chord, so a good line plays the melody.
let ctx = null, master, musicBus, sfxBus, verb, verbIn, delay, windGain, windFilt, comp;
let musicOn = true, sfxOn = true, started = false, nextChordT = 0, chordIdx = 0, leg = 0, arpT = 0, noteStep = 0;
const ST = { muted: false };

// chord progressions (MIDI) per leg; scale = notes for melodies
const PROG = [
  { chords: [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 64], [45, 52, 57, 61, 64]], scale: [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86] }, // D lydian-ish dawn
  { chords: [[45, 52, 57, 60, 64], [41, 48, 53, 57, 64], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59]], scale: [64, 67, 69, 71, 72, 76, 79, 81, 83, 84, 88] }, // A minor warm
  { chords: [[38, 45, 50, 53, 57], [46, 53, 58, 62, 65], [41, 48, 53, 57, 60], [43, 50, 55, 58, 62]], scale: [62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86] }, // D dorian storm
  { chords: [[44, 51, 56, 60, 63], [49, 56, 61, 65, 68], [46, 53, 58, 61, 65], [51, 58, 63, 67, 70]], scale: [63, 65, 68, 70, 72, 75, 77, 80, 82, 84, 87] }, // Ab pentatonic dusk
  { chords: [[40, 47, 52, 56, 59], [45, 52, 57, 59, 64], [37, 44, 49, 52, 56], [42, 49, 54, 57, 61]], scale: [64, 66, 68, 71, 73, 76, 78, 80, 83, 85, 88] }, // E major night
];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export function initAudio() {
  if (ctx) return ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  master = ctx.createGain(); master.gain.value = ST.muted ? 0 : 0.9;
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.55 : 0; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.8 : 0; sfxBus.connect(master);
  // reverb (generated IR)
  verb = ctx.createConvolver(); const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  verb.buffer = ir; verbIn = ctx.createGain(); verbIn.gain.value = 0.5; verbIn.connect(verb); const vOut = ctx.createGain(); vOut.gain.value = 0.7; verb.connect(vOut); vOut.connect(master);
  delay = ctx.createDelay(1.0); delay.delayTime.value = 0.375; const fb = ctx.createGain(); fb.gain.value = 0.38; const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
  delay.connect(dl); dl.connect(fb); fb.connect(delay); const dOut = ctx.createGain(); dOut.gain.value = 0.35; dl.connect(dOut); dOut.connect(verbIn); dOut.connect(master);
  // wind bed
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
  let last = 0; for (let i = 0; i < nd.length; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; nd[i] = last * 6; }
  const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
  windFilt = ctx.createBiquadFilter(); windFilt.type = 'bandpass'; windFilt.frequency.value = 500; windFilt.Q.value = 0.7;
  windGain = ctx.createGain(); windGain.gain.value = 0.0;
  ns.connect(windFilt); windFilt.connect(windGain); windGain.connect(musicBus); ns.start();
  nextChordT = ctx.currentTime + 0.1;
  return ctx;
}
export function startAudio() { if (!ctx) initAudio(); if (ctx && ctx.state === 'suspended') ctx.resume(); started = true; }
export function suspendAudio() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resumeAudio() { if (ctx && started && ctx.state === 'suspended') ctx.resume(); }
export function setMuted(m) { ST.muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05); }
export function setMusic(on) { musicOn = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.2); }
export function setSfx(on) { sfxOn = on; if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05); }
export function setLeg(i) { leg = ((i % 5) + 5) % 5; }

function env(g, t, a, peak, d, sus = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d); }

function pad(notes, t, dur) {
  for (const m of notes) {
    const f = mtof(m);
    const g = ctx.createGain(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700 + leg * 60; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1100 + leg * 80, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(600, t + dur);
    for (const det of [-7, 6]) { const o = ctx.createOscillator(); o.type = m < 48 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 3.2); }
    const v = m < 48 ? 0.05 : 0.018;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 2.2); g.gain.setValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 3);
    lp.connect(g); g.connect(musicBus); g.connect(verbIn);
  }
}
function pluck(m, t, vol = 0.06, bus = null) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 2.001;
  const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(g); o.connect(g);
  env(g, t, 0.005, vol, 1.4);
  g.connect(bus || musicBus); g.connect(delay); g.connect(verbIn);
  o.start(t); o2.start(t); o.stop(t + 1.6); o2.stop(t + 1.6);
}

// called every frame
export function tickAudio(dt, speed, playing) {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (windGain) { windGain.gain.setTargetAtTime(playing ? 0.05 + speed * 0.0016 : 0.03, now, 0.5); windFilt.frequency.setTargetAtTime(300 + speed * 12, now, 0.5); }
  if (now > nextChordT - 0.2) {
    const pr = PROG[leg]; const ch = pr.chords[chordIdx % pr.chords.length];
    pad(ch, Math.max(now, nextChordT), 7.6); chordIdx++; nextChordT = Math.max(now, nextChordT) + 8;
  }
  arpT -= dt;
  if (arpT <= 0) { // sparse generative melody
    arpT = 0.75 + Math.random() * 1.6;
    if (Math.random() < 0.55) { const sc = PROG[leg].scale; pluck(sc[(Math.random() * 7) | 0] - 12, now + 0.02, 0.028); }
  }
}

// ---------- SFX ----------
export function sMote(combo) {
  if (!ctx) return; const t = ctx.currentTime; const sc = PROG[leg].scale;
  noteStep = (noteStep + 1 + (Math.random() < 0.3 ? 1 : 0)) % sc.length;
  const m = sc[Math.min(sc.length - 1, (noteStep + Math.min(4, combo)) % sc.length)];
  pluck(m, t, 0.07, sfxBus);
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = mtof(m + 24); env(g, t, 0.002, 0.02, 0.25); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.3);
}
export function sHit() {
  if (!ctx) return; const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
  env(g, t, 0.003, 0.18, 0.2); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.25);
  noiseBurst(t, 0.12, 1800, 0.12, 'bandpass');
}
export function sChirp(n = 3) {
  if (!ctx) return; const t0 = ctx.currentTime;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 0.07 + Math.random() * 0.03, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    const f = 2600 + Math.random() * 1400; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.04); o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.08);
    env(g, t, 0.004, 0.035, 0.08); o.connect(g); g.connect(sfxBus); g.connect(verbIn); o.start(t); o.stop(t + 0.12);
  }
}
export function sScreech() {
  if (!ctx) return; const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter(); o.type = 'sawtooth'; bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 3;
  o.frequency.setValueAtTime(2200, t); o.frequency.exponentialRampToValueAtTime(1300, t + 0.6);
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 28; lg.gain.value = 90; lfo.connect(lg); lg.connect(o.frequency);
  env(g, t, 0.02, 0.07, 0.6); o.connect(bp); bp.connect(g); g.connect(sfxBus); g.connect(verbIn); o.start(t); lfo.start(t); o.stop(t + 0.7); lfo.stop(t + 0.7);
}
export function sDeter() { if (!ctx) return; const t = ctx.currentTime; [0, 4, 7, 12].forEach((k, i) => pluck(PROG[leg].scale[2] + k, t + i * 0.06, 0.05, sfxBus)); }
export function sThunder() { if (!ctx) return; const t = ctx.currentTime; noiseBurst(t, 2.2, 300, 0.5, 'lowpass'); noiseBurst(t, 0.15, 3000, 0.25, 'highpass'); }
export function sCrackle() { if (!ctx) return; const t = ctx.currentTime; for (let i = 0; i < 5; i++) noiseBurst(t + i * 0.22 + Math.random() * 0.1, 0.05, 5000, 0.04, 'highpass'); }
export function sSplit() { if (!ctx) return; const t = ctx.currentTime; noiseBurst(t, 0.35, 900, 0.08, 'bandpass', 2600); }
export function sPerfect() { if (!ctx) return; const t = ctx.currentTime; const sc = PROG[leg].scale; [0, 2, 4, 6, 8].forEach((k, i) => pluck(sc[k], t + i * 0.05, 0.05, sfxBus)); }
export function sLeg() { if (!ctx) return; const t = ctx.currentTime; const sc = PROG[leg].scale; [0, 2, 4, 7, 9].forEach((k, i) => pluck(sc[Math.min(10, k)], t + i * 0.12, 0.07, sfxBus)); }
export function sUI() { if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.05); env(g, t, 0.002, 0.06, 0.09); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.12); }
export function sOver() { if (!ctx) return; const t = ctx.currentTime; const sc = PROG[leg].scale; [6, 4, 2, 0].forEach((k, i) => pluck(sc[k] - 12, t + i * 0.2, 0.06, sfxBus)); }
function noiseBurst(t, dur, freq, vol, type, sweepTo) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur)), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
  const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain(); env(g, t, Math.min(0.02, dur * 0.2), vol, dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); g.connect(verbIn); s.start(t); s.stop(t + dur + 0.05);
}
export const audio = { crackle: sCrackle, thunder: sThunder };
