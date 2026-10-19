// localStorage persistence (prefix "sled.") — all access wrapped in try/catch
const P = 'sled.';
export function load(k, d) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
export function save(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) {} }
export const S = {
  best: load('best', 0), coins: load('coins', 0), mute: load('mute', false), quality: load('quality', 'high'),
  char: load('char', 'pip'), sled: load('sled', 'classic'), owned: load('owned', ['pip', 'classic']),
  missions: load('missions', null), multLevel: load('multLevel', 0), tutorial: load('tutorial', 0), runs: load('runs', 0),
};
export function persist() { for (const k in S) save(k, S[k]); }
