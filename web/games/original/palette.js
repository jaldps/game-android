// Leg definitions + time-of-day palettes. Interpolated continuously by distance flown.
import { hex, mix, smooth, lerp } from './util.js';

export const LEG_LEN = 2000;
export const LEGS = [
  { name: 'Dawn Dunes', roman: 'I', style: 'dunes', hawks: 0,
    pal: { skyTop: '#2c2b63', skyMid: '#9b5f9f', skyLow: '#ffb59c', fog: '#f0a6a8', near: '#3b1d47', rim: '#ffd6b0',
      sun: '#fff3dc', glow: '#ffc7a6', sunX: 0.64, sunY: 0.5, sunR: 7.5, stars: 0.35, mote: '#ffe7a3', bird: '#2a1433',
      cloud: '#ffd2c4', cap: '#e8a49a', water: '#c77a8f', aurora: 0, rain: 0, snow: 0, dust: 1, lantern: 0, moon: 0 } },
  { name: 'Amber Canyon', roman: 'II', style: 'canyon', hawks: 1,
    pal: { skyTop: '#d65a35', skyMid: '#f28c45', skyLow: '#ffd38a', fog: '#f4ad62', near: '#55191a', rim: '#fff0c0',
      sun: '#fff7d1', glow: '#ffe2a0', sunX: 0.32, sunY: 0.3, sunR: 6.5, stars: 0, mote: '#fffbe0', bird: '#3d0f12',
      cloud: '#ffe3b0', cap: '#d9733e', water: '#b8562f', aurora: 0, rain: 0, snow: 0, dust: 0.8, lantern: 0, moon: 0 } },
  { name: 'Monsoon Coast', roman: 'III', style: 'coast', hawks: 1,
    pal: { skyTop: '#22323f', skyMid: '#47636f', skyLow: '#a8bdb6', fog: '#8ea8a6', near: '#132029', rim: '#d9efe6',
      sun: '#f0f6ee', glow: '#c9ddd6', sunX: 0.78, sunY: 0.28, sunR: 5.5, stars: 0, mote: '#d8fff1', bird: '#0c161c',
      cloud: '#6f8b92', cap: '#cfe3df', water: '#3d5a63', aurora: 0, rain: 1, snow: 0, dust: 0, lantern: 0, moon: 0 } },
  { name: 'Lantern Valley', roman: 'IV', style: 'valley', hawks: 1,
    pal: { skyTop: '#1d1848', skyMid: '#7b2e6c', skyLow: '#ff8058', fog: '#c8547a', near: '#1b0e2b', rim: '#ffb27a',
      sun: '#ffc982', glow: '#ff9a63', sunX: 0.5, sunY: 0.74, sunR: 11, stars: 0.4, mote: '#ffd9a0', bird: '#150a22',
      cloud: '#ff9e8a', cap: '#d2577a', water: '#6e2a5c', aurora: 0, rain: 0, snow: 0, dust: 0, lantern: 1, moon: 0 } },
  { name: 'Moon Peaks', roman: 'V', style: 'peaks', hawks: 1,
    pal: { skyTop: '#040820', skyMid: '#11265a', skyLow: '#3d649f', fog: '#2c4c7e', near: '#060b1c', rim: '#a9c8ff',
      sun: '#eef3ff', glow: '#9fbcff', sunX: 0.72, sunY: 0.24, sunR: 5, stars: 1, mote: '#c9fff4', bird: '#dfe9ff',
      cloud: '#3a5a92', cap: '#cfe0ff', water: '#1c3566', aurora: 1, rain: 0, snow: 1, dust: 0, lantern: 0, moon: 1 } },
];

const KEYS_C = ['skyTop', 'skyMid', 'skyLow', 'fog', 'near', 'rim', 'sun', 'glow', 'mote', 'bird', 'cloud', 'cap', 'water'];
const KEYS_N = ['sunX', 'sunY', 'sunR', 'stars', 'aurora', 'rain', 'snow', 'dust', 'lantern', 'moon'];
for (const L of LEGS) { L.c = {}; for (const k of KEYS_C) L.c[k] = hex(L.pal[k]); }

// live palette object reused every frame
export const P = { leg: 0, legF: 0, blend: 0, nextLeg: 1, style: 'dunes', style2: 'dunes' };
for (const k of KEYS_C) P[k] = [0, 0, 0];

export function legIndexAt(d) { return Math.max(0, Math.floor(d / LEG_LEN)); }
export function styleAt(d) { return LEGS[legIndexAt(d) % 5].style; }

export function updatePalette(d, flash = 0) {
  const li = legIndexAt(d), f = d / LEG_LEN - li;
  const A = LEGS[li % 5], B = LEGS[(li + 1) % 5];
  const t = smooth(0.8, 1.0, f);
  P.leg = li; P.legF = f; P.blend = t; P.style = A.style; P.style2 = B.style;
  for (const k of KEYS_C) mix(A.c[k], B.c[k], t, P[k]);
  for (const k of KEYS_N) P[k] = lerp(A.pal[k], B.pal[k], t);
  // the sun drifts slowly across each leg (time passing)
  P.sunX += (f - 0.5) * 0.06 * (1 - t);
  P.sunY += (f - 0.4) * 0.05 * (1 - t);
  if (flash > 0) { // lightning flash brightens the sky
    for (const k of ['skyTop', 'skyMid', 'skyLow', 'fog']) mix(P[k], [235, 245, 255], flash * 0.6, P[k]);
  }
  return P;
}
