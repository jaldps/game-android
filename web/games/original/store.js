// Persistence (localStorage, prefix "original.") with safe fallbacks.
const PFX = 'original.';
export function load(k, d) { try { const v = localStorage.getItem(PFX + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
export function save(k, v) { try { localStorage.setItem(PFX + k, JSON.stringify(v)); } catch (e) {} }
export const S = {
  best: load('best', 0), legs: load('legs', 0), light: load('light', 0), species: load('species', 0),
  sound: load('sound', true), music: load('music', true), haptics: load('haptics', true), quality: load('quality', 1),
  seenSplit: load('seenSplit', false), seenDrag: load('seenDrag', false), seenHawk: load('seenHawk', false), startLeg: load('startLeg', 0),
};
export function persist(...keys) { for (const k of keys) save(k, S[k]); }
export const SPECIES = [
  { name: 'Starlings', need: 0 },
  { name: 'Swallows', need: 300 },
  { name: 'Paper Cranes', need: 900 },
  { name: 'Lantern Moths', need: 2000 },
];
