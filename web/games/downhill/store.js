// Persistent career state (localStorage, key prefix "downhill.").
const KEY = 'downhill.save';
const DEF = {
  coins: 0, unlocked: 1, sel: 0, best: {}, stars: {}, up: { speed: 0, grip: 0, armor: 0, boost: 0 },
  kit: 0, paint: 0, ownedKits: [0], ownedPaints: [0], sound: true, music: true, quality: 'high', races: 0, tutorial: false,
};
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) return Object.assign(structuredClone(DEF), s, { up: Object.assign({}, DEF.up, s.up || {}) }); } catch (e) {}
  return structuredClone(DEF);
}
export const store = load();
export function totalStars() { let n = 0; for (const k in store.stars) n += store.stars[k] | 0; return n; }
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
    const n = totalStars(); if (n > 0) localStorage.setItem('downhill.stars', String(n));
  } catch (e) {}
}
