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
};
