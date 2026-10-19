// Seeded RNG (mulberry32) — deterministic with ?seed=N
let s = 1;
export function seed(n) { s = (n >>> 0) || 1; }
export function rand() {
  s |= 0; s = (s + 0x6D2B79F5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const range = (a, b) => a + (b - a) * rand();
export const irange = (a, b) => Math.floor(a + (b - a + 1) * rand());
export const pick = arr => arr[Math.floor(rand() * arr.length)];
export const chance = p => rand() < p;
