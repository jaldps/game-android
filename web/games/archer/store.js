// localStorage persistence (prefix archer.) — every access guarded.
const K = 'archer.';
function get(k, d) { try { const v = localStorage.getItem(K + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function set(k, v) { try { localStorage.setItem(K + k, JSON.stringify(v)); } catch (e) {} }
export const store = {
  get coins() { return get('coins', 150); }, set coins(v) { set('coins', v | 0); },
  get best() { return get('best', 0); }, set best(v) { set('best', v | 0); },           // highest tower floor cleared
  get floor() { return get('floor', 0); }, set floor(v) { set('floor', v | 0); },        // next tower floor index (0-based)
  get stars() { return get('stars', {}); }, set stars(v) { set('stars', v); },           // floorIndex -> best stars
  get heroes() { return get('heroes', ['finn']); }, set heroes(v) { set('heroes', v); },
  get bows() { return get('bows', ['twig']); }, set bows(v) { set('bows', v); },
  get hero() { return get('hero', 'finn'); }, set hero(v) { set('hero', v); },
  get bow() { return get('bow', 'twig'); }, set bow(v) { set('bow', v); },
  get muted() { return get('muted', false); }, set muted(v) { set('muted', !!v); },
  get music() { return get('music', true); }, set music(v) { set('music', !!v); },
  get quality() { return get('quality', 'high'); }, set quality(v) { set('quality', v); },
  get tutorial() { return get('tutorial', 0); }, set tutorial(v) { set('tutorial', v | 0); },
  get diff() { return get('diff', 1); }, set diff(v) { set('diff', v | 0); },
};
