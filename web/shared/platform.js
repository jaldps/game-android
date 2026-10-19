// Tiny platform bridge shared by all games. Read-only for game agents.
// Android shell exposes window.AndroidHost (setOrientation, vibrate, exitGame). In a desktop browser these no-op gracefully.
const host = window.AndroidHost;
export const isAndroid = !!host;
export const params = new URLSearchParams(location.search);
export function setOrientation(o /* 'portrait' | 'landscape' */) { try { host?.setOrientation(o); } catch (e) {} }
export function vibrate(ms = 20) { try { host ? host.vibrate(ms | 0) : navigator.vibrate?.(ms); } catch (e) {} }
export function goHome() { if (host) host.exitGame(); else location.href = '../../index.html'; }
/** handler() returns true if it consumed the back press (e.g. closed a pause menu); false -> app returns to hub */
export function onBack(handler) { window.__onBack = handler; }
/** Called when the app is backgrounded/foregrounded (also on document visibility changes). */
export function onPauseResume(pause, resume) {
  window.addEventListener('hostpause', pause); window.addEventListener('hostresume', resume);
  document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());
}
