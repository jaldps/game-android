// Seeded RNG (mulberry32) — deterministic runs with ?seed=N
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const r = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.reseed = s => { a = (s >>> 0) || 1; };
  return r;
}
// a separate cosmetic RNG so visual variety never perturbs gameplay determinism
export const vis = makeRng(987654);
