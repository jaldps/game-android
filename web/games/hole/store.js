// localStorage persistence (prefix hole.)
const K = 'hole.';
function get(k, d) { try { const v = localStorage.getItem(K + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function set(k, v) { try { localStorage.setItem(K + k, JSON.stringify(v)); } catch (e) {} }
export const store = {
  get coins() { return get('coins', 0); }, set coins(v) { set('coins', v); },
  get best() { return get('best', 0); }, set best(v) { set('best', v); },
  get owned() { return get('owned', ['classic']); }, set owned(v) { set('owned', v); },
  get skin() { return get('skin', 'classic'); }, set skin(v) { set('skin', v); },
  get quality() { return get('quality', 'high'); }, set quality(v) { set('quality', v); },
  get played() { return get('played', 0); }, set played(v) { set('played', v); },
  get map() { return get('map', 'harbor'); }, set map(v) { set('map', v); },
  get maps() { return get('maps', ['harbor']); }, set maps(v) { set('maps', v); },
  get xp() { return get('xp', 0); }, set xp(v) { set('xp', v); },
  get goals() { return get('goals', null); }, set goals(v) { set('goals', v); },
};

// ---------------- daily goals ----------------
export const GOAL_DEFS = [
  { id: 'eat', text: 'Swallow {t} things', target: 260, reward: 120 },
  { id: 'size', text: 'Reach size {t} in one round', target: 22, reward: 160 },
  { id: 'win', text: 'Finish 1st in a round', target: 1, reward: 220 },
  { id: 'mega', text: 'Swallow {t} set-pieces', target: 2, reward: 260 },
];
const today = () => new Date().toISOString().slice(0, 10);
export function dailyGoals() {
  let g = store.goals;
  if (!g || g.day !== today()) {
    g = { day: today(), p: {}, done: {} };
    for (const d of GOAL_DEFS) { g.p[d.id] = 0; g.done[d.id] = false; }
    store.goals = g;
  }
  return g;
}
/** Record progress; returns the coins awarded by goals that just completed. */
export function bumpGoal(id, amount, absolute = false) {
  const g = dailyGoals(); const d = GOAL_DEFS.find(x => x.id === id); if (!d || g.done[id]) return 0;
  g.p[id] = absolute ? Math.max(g.p[id] || 0, amount) : (g.p[id] || 0) + amount;
  let coins = 0;
  if (g.p[id] >= d.target) { g.done[id] = true; coins = d.reward; }
  store.goals = g;
  return coins;
}
export function goalLevel() { const xp = store.xp; return 1 + Math.floor(Math.sqrt(xp / 180)); }
export function goalLevelProgress() {
  const L = goalLevel(); const a = (L - 1) * (L - 1) * 180, b = L * L * 180;
  return { level: L, pct: Math.max(0, Math.min(1, (store.xp - a) / (b - a))), need: Math.round(b - store.xp) };
}
