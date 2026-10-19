# Clearplay Arcade — shared build spec (every agent reads this fully first)

One Android APK = a native WebView shell (DONE, works) + a hub menu + 6 ad-free HTML5/WebGL games.
Project root `/home/user/game-android`. Web root (becomes the APK's assets): `web/`.
The user's bar: every game must look and feel **AAA mobile** — better than the ad-riddled original when
compared side-by-side *blind*. A separate harsh critic agent will judge your screenshots blind against real
screenshots of the original (`refs/<id>/`). You will keep iterating until the critic prefers yours.

## Games (id → working title → reference game whose GAMEPLAY FEEL to recreate)
| id | Title (original, use it) | Recreate the feel of | Orientation |
|---|---|---|---|
| hole | Sinkhole City | hole.io — a hole roams a city swallowing objects, grows, 2-min round vs bots | portrait |
| crowd | Mob Rush | Crowd City — recruit neutral pedestrians into your colored crowd, absorb smaller crowds, 2-min round | portrait |
| archer | Bowbrawl | Bowmasters / "Archers" duel — turn-based 2D-side-view archery duels, drag to aim (power+angle w/ trajectory hint), wind, headshots, ragdoll-ish hits, HP bars, many opponents | landscape |
| downhill | Ridgeline | Downhill Masters — 3rd-person downhill mountain-bike racing vs rivals on scenic courses, steer/brake/pump, jumps, power boost | portrait |
| sled | Frostline Dash | Subway-Surfers-style 3-lane endless runner, but on a sled down a snowy winter village/mountain: swipe left/right/up(jump)/down(duck), obstacles, coins, power-ups | portrait |
| original | (yours to name) | An ORIGINAL game designed by its builder. Visual bar: Alto's Odyssey / Monument Valley tier art direction | builder decides |

## Hard rules
1. **Only write inside your own folders**: `web/games/<id>/` and `shots/<id>/`. Never edit `web/lib`, `web/shared`, `android/`, `tools/`, other games. Need a change there? Say so in your report.
2. **Original names and art only.** Recreate gameplay feel; never the original's name, logo, characters, UI art, text or exact level layouts.
3. No ads, no IAP, no network at runtime. Everything offline inside the APK.
4. Entry: `web/games/<id>/index.html`. Use this import map exactly:
   `<script type="importmap">{"imports":{"three":"../../lib/three.module.js","three/addons/":"../../lib/addons/"}}</script>`
   three.js r186 vendored; addons in `web/lib/addons/` (postprocessing/EffectComposer, UnrealBloomPass, OutputPass, SMAAPass, GTAOPass, Sky, Water, RoundedBoxGeometry, SimplexNoise, BufferGeometryUtils, GLTFLoader, RoomEnvironment...). Split code into multiple ES modules in your folder. 2D canvas/raw WebGL allowed if better (archer may suit 2.5D three.js or a gorgeous 2D canvas — your call), same visual bar.
5. Shared helpers (read-only): `../../shared/platform.js` (setOrientation, vibrate, goHome, onBack, onPauseResume, params) and `../../shared/fonts.css` (families: 'Lilita One', 'Fredoka', 'Nunito' 600/800/900, 'Russo One', 'Bungee', 'Inter'). Link fonts.css; wait for `document.fonts.ready` before drawing canvas text.
6. Assets: procedural first (canvas textures w/ noise, shaders, built geometry, WebAudio synth). You MAY fetch **CC0/MIT/CC-BY** assets from `raw.githubusercontent.com`/GitHub (three.js repo examples, KhronosGroup glTF samples, Kenney/Quaternius CC0 mirrors) or npm (`npm pack`) — other sites are blocked, don't fight it. Record every external asset + license in `web/games/<id>/CREDITS.md`. ≤15 MB per game folder. Rigged CC0 characters (glTF with animations) are a big quality win for humanoid games — worth looking for on GitHub.
7. Audio: WebAudio procedural SFX + music loop; start on first touch; mute toggle persisted.

## Platform contract
- Served at `https://appassets.androidplatform.net/games/<id>/index.html` (secure context; ES modules OK). Testing: `http://127.0.0.1:8080/games/<id>/index.html` (run `tools/ensure-server.sh` first).
- Call `setOrientation(...)` at load. Also behave sanely in the other orientation.
- `onBack(() => {...; return true})` to open/close your pause menu; return false to exit to hub. Provide an in-game home/pause button → `goHome()`.
- `onPauseResume(pause, resume)` — pause sim and audio when backgrounded.
- HUD respects `env(safe-area-inset-*)`. Touch-first pointer events; mouse/keyboard also work.
- Persist best scores/unlocks/settings in localStorage, key prefix `<id>.` (wrap in try/catch).

## Performance
Mid-range Android (Adreno 6xx / Mali-G7x) at 60 fps: instancing, merged geometry, atlases, pixel ratio ≤2, adaptive resolution if frame time climbs, shadow map ≤2048 with tight frustum following action, pooling, no per-frame allocations, <150 draw calls. Cheap post (bloom/vignette/grade) welcome. Quality Low/High in settings. Expose `window.__fps`.

## Testing hooks (REQUIRED — the critic depends on them)
- `?autoplay=1` → competent bot plays from a mid-game state, loops forever (no menus) so screenshots show real action.
- `?scene=menu|play|over` → open directly on that screen (`over` = results with plausible stats).
- `?seed=N` deterministic. `window.__game` exposes key state.
- Headless review is SwiftShader on 2 CPUs (~2–15 fps). Clamp dt (`Math.min(dt,1/30)`); support `?fixedstep=1` (advance sim 1/60 per rendered frame) and `?warp=N` (simulate N seconds instantly before first render) so screenshots show meaningful mid-game state. Never judge perf from headless fps.

## Screenshot tools
```
tools/ensure-server.sh
tools/shot.sh "games/<id>/index.html?autoplay=1&warp=20" shots/<id>/r1_play --times 3000,7000 [--landscape] [--tap x,y@ms] [--swipe x1,y1,x2,y2@ms] [--eval "js"]
# -> shots/<id>/r1_play-3000.png ... and shots/<id>/r1_play-console.txt (fix EVERY error in it)
python3 tools/blind.py shots/<id>/r1_play-7000.png refs/<id>/<ref>.jpg shots/<id>/blind/b1   # blind A/B composite (+ hidden .key)
```
Runs are serialized across all agents by a lock — keep each run short (≤3 time marks). Viewport 412x915 CSS px @2x (portrait) or swapped with --landscape. Look at every screenshot with the Read tool.

## Quality bar ("AAA mobile")
Coherent art direction + deliberate palette; real lighting (key/fill/rim, soft shadows, AO or baked/fake AO, fog/atmosphere, ACES tone mapping, color grade); textured varied materials (never flat default boxes, never empty grey planes); detail density (props, decals, foliage, curbs, signage); characters with silhouette + animation (walk/run cycles, squash & stretch, idle); juice (particles, shake, hit-stop, easing, combo popups, trails, flashes, camera that frames action); polished UI (display type with outlines/shadows, SVG icons, animated transitions, readable HUD, title screen with live 3D backdrop, tutorial hint, pause/settings, results with stars/stats, progression/unlocks/skins); sound for every event; gameplay that is fun, fair, tuned and lasts. Nothing placeholder. Nothing broken. No console errors.
