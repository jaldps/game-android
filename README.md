# Clearplay Arcade (game-android)

An **ad-free Android app (APK)** that bundles six mobile games in one launcher. Five are clones of popular, ad-heavy
mobile games (rebuilt from scratch with original names and art) and one is an original game design. All six are
**HTML5 / WebGL** (three.js r186 or Canvas2D) and run fully offline inside a thin native Android WebView shell.

> **Status: work in progress (paused on 2026-10-19 by request).** One game is complete (first pass), one is
> playable and beautiful, one has a world but no game loop yet, and three are partially written. Nothing is
> broken in the shell or the hub. The full story is in [`docs/PROJECT_HISTORY.md`](docs/PROJECT_HISTORY.md)
> and the remaining work in [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md).

| id | Title | Clone of | Orientation | State |
|---|---|---|---|---|
| `hole` | **Sinkhole City** | hole.io | portrait | ✅ Complete first build, 20 self-review rounds. Critic round 1: **NOT YET** (won 2 of 6 blind pairings). Fix list ready. |
| `original` | **Murmur** | *original design* | landscape | 🟢 Playable, looks great (Alto's Odyssey style). Stopped mid-review by the usage limit. |
| `sled` | **Frostline Dash** | Subway Surfers (on a sled, in snow) | portrait | 🟡 Village world, rider, sled and yeti render. No gameplay loop or HUD yet. |
| `crowd` | **Mob Rush** | Crowd City | portrait | 🟠 ~2,700 lines written (city, people, AI, HUD); main loop unfinished, page doesn't render yet. |
| `downhill` | **Ridgeline** | Downhill Masters (MTB) | portrait | 🟠 Terrain, track, foliage, rig and textures modules written; no `index.html` yet. |
| `archer` | **Bowbrawl** | Bowmasters / "Archers" duels | landscape | 🟠 Character rig, arenas and data modules plus dev test pages; no `index.html` yet. |

![Sinkhole City gameplay](screenshots/hole/final_play-6000.png)

## Install the current APK
`dist/ClearplayArcade.apk` is a ~21 MB release build signed with a debug key, so it installs directly. It contains the
hub and the **playable Sinkhole City** (built 2026-10-19 13:33 UTC, before Murmur was playable). Enable
"Install unknown apps" for your file manager or browser, then open the APK. Android 8.0+ (minSdk 26), OpenGL ES 3.0.

To get an APK with everything currently in `web/`, including Murmur, rebuild it (see below).

## Repository layout
```
android/            Native shell: one Java Activity hosting a WebView (no AndroidX, no dependencies)
  app/src/main/java/com/clearplay/arcade/MainActivity.java
web/                Everything that ships inside the APK as assets (the web root)
  index.html        Hub / launcher (reads games/<id>/meta.json for title, tagline, thumbnail, best score)
  shared/           platform.js (Android bridge helpers) + fonts.css + bundled .woff2 fonts
  lib/              three.js r186 (three.module.js, three.core.js) + addons/ (examples/jsm)
  games/<id>/       One folder per game; each is self-contained ES modules + index.html
tools/              Dev tooling: static server, headless screenshot harness, blind A/B composer, APK build script
docs/               Project history (incl. our chat), next steps, briefs given to the AI agents, critic/builder reports
screenshots/        Curated screenshots of every game state reached so far, plus the critic's blind composites
refs/SOURCES.md     Where the reference screenshots of the original games came from (images not included)
SPEC.md             The binding build spec every builder agent followed (contract, hooks, quality bar)
CRITIC.md           The harsh-critic procedure (blind A/B vs originals, SHIP criteria)
dist/               Last built APK
```

## How the shell works
- `MainActivity` creates a full-screen, immersive WebView and serves `web/` (packaged as APK assets) from the
  virtual secure origin `https://appassets.androidplatform.net/`. It intercepts requests in
  `shouldInterceptRequest`, which makes ES modules, import maps and `fetch()` work without a file:// CORS problem.
- JS bridge `window.AndroidHost`: `setOrientation('portrait'|'landscape')`, `vibrate(ms)`, `exitGame()`.
  Games use it through `web/shared/platform.js` (`setOrientation`, `vibrate`, `goHome`, `onBack`, `onPauseResume`).
- Android back button: calls `window.__onBack()` in the page; if that returns true, the game consumed it (e.g. closed
  its pause menu). Otherwise it returns to the hub, or exits the app if already on the hub.
- `hostpause` / `hostresume` window events fire when the app goes to background or foreground.
- Keeps the screen on, hides system bars, supports display cutouts, `largeHeap`, hardware acceleration.

## Build the APK
Requirements: JDK 17+ (21 used), Android SDK with platform 35 + build-tools (34/35), Gradle 8.x (8.14.3 used).
```bash
cd android
echo "sdk.dir=/path/to/android-sdk" > local.properties
gradle assembleRelease          # AGP 8.7.3, compileSdk/targetSdk 35, minSdk 26
# -> android/app/build/outputs/apk/release/app-release.apk  (release build signed with the debug key)
```
`app/build.gradle` points the asset source at `../../web`, so whatever is in `web/` ships. `tools/apk.sh` does
the same and copies the result to `dist/ClearplayArcade.apk`. It and the other scripts hard-code
`/home/user/game-android` as the project root, so adjust that path if you run them elsewhere.

Before a store-quality release: prune `web/lib/addons` to only the files the games import (it's ~24 MB, while
the games use a handful), add a real signing key, and add an adaptive launcher icon.

## Run / test in a desktop browser
```bash
npm install                     # playwright-core + fonts + three (only needed for the tools)
node tools/serve.mjs 8080       # serves web/ at http://127.0.0.1:8080/
# open http://127.0.0.1:8080/  or a game directly, e.g. /games/hole/index.html
```
Every game is required to support these URL hooks (see SPEC.md):
`?autoplay=1` (a bot plays mid-game), `?scene=menu|play|over`, `?seed=N`, `?warp=N` (simulate N seconds before
the first frame), `?fixedstep=1`, and to expose `window.__game` and `window.__fps`.

Headless screenshots (Chromium + SwiftShader; phone viewport 412×915 @2x):
```bash
tools/shot.sh "games/hole/index.html?autoplay=1&warp=20" shots/hole/test --times 3000,8000 [--landscape] [--tap x,y@ms] [--swipe x1,y1,x2,y2@ms] [--eval "js"]
python3 tools/blind.py ours.png reference.jpg out/dir/name [--crop x0,y0,x1,y1]   # random-sided A/B composite + hidden key file
```

## Licensing / IP notes
- All game code, geometry, textures, audio and UI are generated procedurally in code. There are no third-party
  game assets. The games use original names and do not use the originals' names, logos, characters or UI art.
- three.js is MIT. The bundled fonts (Lilita One, Fredoka, Nunito, Russo One, Bungee, Inter) are SIL OFL, from `@fontsource`.
- Reference screenshots of the commercial originals (used only for the blind comparisons) are **not** committed;
  `refs/SOURCES.md` lists where they came from.
- Recommended to keep this repository **private**: it includes the full working conversation and agent reports.
