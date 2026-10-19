# Project history: our conversation and everything that was done

This document records the whole working session that produced this repository: what you asked for, what Claude
(the orchestrating AI) decided and did, what the sub-agents did, what went wrong, and where things stand.
Times are UTC.

---

## 1. Your original request (verbatim)

> I want you to build an android app (APK) that consist on all these games you want to play but ads make so
> annoying. So basically clone hole.io, crow control city craze, the archer game that seems like gunbound but in
> arch battle, downhill racing, and sled surfers and one original game you design.
> . It should be utterly perfect, visually beautiful, with every single thing done at AAA quality—from textures to
> physics to anything you could think of.
>
> Fan out sub-agents and have sub-agents tackle each one individually so that the game is utterly perfect. You
> should /loop on each item and have a separate sub-agent check it visually to ensure it looks triple A. That
> separate sub-agent should be a really harsh critic, and if it doesn't look triple A, it should keep going.
>
> Don't stop until each sub-agent is utterly wowed with the quality when compared with the actual original games.
> It should literally compare them side by side blind and say which one looks better. Do this in the appropriate
> language. /loop until it's utterly perfect. Fan out sub-agents and ultracode.

### How the request was interpreted
| You said | Built as | Reference game |
|---|---|---|
| hole.io | **Sinkhole City** (`hole`) | hole.io (Voodoo) |
| "crow control city craze" | **Mob Rush** (`crowd`) | Crowd City (Voodoo) |
| "the archer game that seems like gunbound but in arch battle" | **Bowbrawl** (`archer`) | Bowmasters / "Archers" duel games (turn-based side-view artillery with bows) |
| downhill racing | **Ridgeline** (`downhill`) | Downhill Masters (downhill mountain-bike racing) |
| sled surfers | **Frostline Dash** (`sled`) | Subway Surfers (winter edition), reimagined as a 3-lane sled runner |
| one original game | **Murmur** (`original`) | Original. Visual benchmark: Alto's Odyssey / Monument Valley |

Original names are used on purpose. Mechanics can be recreated, but names, logos and characters can't be copied.

---

## 2. Technical decisions (and why)

1. **Native Android shell + HTML5/WebGL games.** One APK, one Java `Activity` with a `WebView`. Each game is a
   self-contained web page using **three.js r186** (or Canvas2D). Reasons: the fastest route to high visual
   quality with procedural art; the games can be screenshotted headlessly (Chromium + SwiftShader) for the
   automated visual critic; no game engine is needed in the cloud build box. The build box had the Android SDK
   (platform 35), JDK 21 and Gradle 8.14.3. Google Maven was reachable, so a plain AGP 8.7.3 build works.
2. **Served from a virtual HTTPS origin** (`https://appassets.androidplatform.net/`) via `shouldInterceptRequest`,
   so ES modules and import maps work (file:// would block module scripts).
3. **Everything offline and procedural:** geometry built in code, canvas/shader textures, WebAudio-synthesized SFX
   and music, and bundled fonts. No ads, no IAP, no network at runtime.
4. **Agent architecture ("fan out + loop"):**
   - One **builder agent per game**, each confined to `web/games/<id>/`. Each follows `SPEC.md` and a per-game
     brief (`docs/briefs/`) and runs ≥6 self-review cycles before reporting.
   - A **fresh, separate critic agent** per review round (`CRITIC.md`). It takes its own screenshots, builds
     **blind A/B composites** of our game vs real screenshots of the original (`tools/blind.py` randomizes sides and
     hides the answer in a key file), writes its verdicts **before** opening the keys, then tallies honestly.
   - **SHIP criteria:** ours preferred in ≥75% of blind pairings, AND the critic would put it next to a
     top-grossing title's store screenshots, AND input works with zero console errors. Otherwise "NOT YET" plus a
     ranked fix list, which goes back to the builder, and the loop repeats with a new critic.
5. **Reference images** of the originals: YouTube thumbnails/frames collected by an earlier attempt, stored locally in
   `refs/<id>/` for the critic (not committed; see `refs/SOURCES.md`).

---

## 3. Timeline

### 2026-10-17 ~02:05: Setup
- Checked the environment (2 CPUs, 7 GB RAM, Android SDK at `/opt/android-sdk`, Chromium for Playwright, network
  limited to package registries and GitHub, but Google Maven reachable).
- Wrote the Android shell (`android/`), vendored three.js r186 (`web/lib`), and **built a test APK successfully**.
- Wrote `tools/serve.mjs` (static server), `tools/shot.mjs`/`shot.sh` (lock-serialized headless phone
  screenshots with tap/swipe/eval), verified WebGL 2 works headless via SwiftShader.
- **Discovered two earlier, abandoned attempts** in the same workspace (Oct 15–16) with a different layout and only
  fragments of code, but with **reference screenshots of all six originals** and a blind-composite script
  (`blind.py`). Kept the references and `blind.py`, archived the rest (not in this repo), and consolidated on one
  clean layout.
- Wrote `SPEC.md` (builder contract) and `CRITIC.md` (critic procedure), plus the per-game briefs.

### 2026-10-17 ~02:20–04:10: Sinkhole City built
- The `hole` builder ran **~1.8 hours, 153 tool calls, 20 build→screenshot→critique rounds**, and delivered a
  complete game (its report: `docs/reports/hole-builder-r1.md`).

### 2026-10-17 ~04:10–04:30: Outage
- Launching the other five builders and the first critic failed repeatedly: the safety-check service that has
  to approve agent launches and shell commands kept timing out. Meanwhile Claude wrote the **hub/launcher**
  (`web/index.html`) and Sinkhole City's `meta.json`. The briefs were moved into files so the launch prompts could be
  short. A scheduled check-in was set to resume.
- Claude's message to you at that point summarized the progress and the blocker, and stated two honest caveats:
  critics compare against **still screenshots** of the originals (not live play), and real-phone frame rates can
  only be confirmed on a device.

### 2026-10-19 13:31–13:35: Resume and launch
- The scheduled check-in fired (the session had been idle about 2 days). Files had survived.
- Launched **5 builders** (crowd, archer, downhill, sled, original) and **critic round 1 for Sinkhole City**.
- Built and sent you the **early preview APK** (hub + Sinkhole City), the one in `dist/`.

### 2026-10-19 ~13:35–14:00: Critic round 1 on Sinkhole City: NOT YET
- Blind tally: **ours preferred in 2 of 6** pairings (needs ≥75%). Zero console errors; touch input works.
- Main findings: the late game empties out (everything edible by ~90 s, eaten lots become flat green/concrete
  slabs), there are no set-piece objects or objectives, the camera is too high and the hole too small early, falling
  objects draw over the hole's near rim, bots are too weak (they grow at 78% of the player's rate), the opening is
  dead, the coin economy is broken, and there's only one map. Full report: `docs/reports/hole-critic-r1.md`. Raised
  the screenshot tool's timeouts to 150 s because the critic hit the 30 s default.
- The fix list had **not yet been sent back** to the Sinkhole City builder when work stopped.

### 2026-10-19 ~14:00: Usage limit hit
- All five builders stopped with **"You've hit your session limit · resets 6:30pm (UTC)" (HTTP 429)** in the
  middle of their work. Their last messages were:
  - Ridgeline: "Now the racer (physics, AI, posing, crash tumble)."
  - Frostline Dash: "Let me get a first visual of the world before building gameplay."
  - Mob Rush: "Now the main orchestration module."
  - Murmur: "Now shots of other legs: canyon (leg 1) and night (leg 4), with timing eval."
  - Bowbrawl: "The screenshot lock is busy (other agents). Meanwhile I'll write the arenas module."

### 2026-10-19: Your second message (verbatim)
> upload everything you have to my github repo. don't develop anything else right now. Be very detailed in the
> explanation, including our chat and what you did and need to do

- Claude asked which repo; you answered: **"create one like jaldps/game-android"**.
- This session can't create new GitHub repositories. It can only push to repos that already exist. So Claude
  prepared this complete repo locally, committed it, and asked you to create the empty `jaldps/game-android` repo
  so it can be pushed.
- No further development was done. The only things run after your message were read-only status checks of each
  game: a headless screenshot each, to report state accurately.

---

## 4. What exists, game by game (as of the pause)

### Sinkhole City (`web/games/hole/`, ~2,900 lines): complete first build
Builder's summary:
- Procedural 7×7 seafront city: roads with lane markings, crosswalks, stop lines and manholes; raised curbs, paver
  sidewalks, parks with paths and fountains, plazas, parking lots, a boardwalk with palms, and an animated sea.
- About 150 buildings in 6 facade styles with windows, balconies, storefronts, awnings and rooftop details.
- The hole is a real cut in the ground: shaft wall fading to black, glowing rim (8 skins), contact ring. Its own
  fall physics: objects lean over the lip, tip, slide, tumble and sink.
- Object tiers from pedestrians to a landmark tower. Growth is based on the area swallowed; the camera zooms out.
- About 500 animated pedestrians and 70 vehicles driving a road graph.
- 7 named bot holes that hunt or flee; holes eat smaller holes.
- 2:00 rounds, countdown, leaderboard, timer, size ring, "+N" popups, combos, banners, kill feed, shake.
- Results with rank, stars and coins; skin shop; live 3D menu backdrop; pause/settings; back button; saved
  progress; synthesized SFX and music.
- Performance work: instancing (77–100 draw calls), culling (1.72M → 150–200k triangles per frame), adaptive
  resolution, buildings in front of the hole fade out.
Screenshots: `screenshots/hole/`. Critic's view: `screenshots/hole-critic-r1/` (includes the 6 blind composites
and the verdicts written before the keys were opened).

### Murmur (`web/games/original/`, ~2,250 lines): playable
The design document (`web/games/original/DESIGN.md`) pitched three concepts (Tidewright, Umbra, Murmur) and chose
**Murmur**. You guide a murmuration of 20–120 starlings led by a pale bird with a red ribbon. Drag to steer; **a
second finger splits the flock in two**; birds die on rocks, water and blades; you collect strays; light motes
play notes of the current chord; hawks hunt the most isolated bird. Five legs from dawn to night (Dawn Dunes,
Amber Canyon, Monsoon Coast, Lantern Valley, Moon Peaks). It's Canvas2D with about 10 procedural parallax layers,
mist, rim light, fake bloom and film grain. Landscape. Runs with zero console errors in autoplay; the HUD shows the
leg name, progress, score, flock count and multiplier. The builder was mid-way through its own review rounds, and
no critic round has run yet.
Screenshots: `screenshots/original/`.

### Frostline Dash (`web/games/sled/`, ~1,730 lines): world and characters, no game loop
It has modules for render, materials, world (village track, timber houses with lit windows, string lights),
obstacles, prefabs, character (rider, sled, yeti) and config. `index.html` currently loads `test.js`, a
**scene viewer**, not the game. There's no input, scoring, HUD, menus or audio yet. Renders with zero errors.
Screenshots: `screenshots/sled/`.

### Mob Rush (`web/games/crowd/`, ~2,700 lines): unfinished
Modules for the city mesh, people (instanced), simulation, AI, HUD, overlay, FX, audio, materials and store, plus
`index.html`. The builder was writing `main.js` (the orchestration) when it stopped, and the page currently doesn't
render (the headless screenshot times out).

### Ridgeline (`web/games/downhill/`, ~2,650 lines): unfinished
Modules for terrain, track, foliage, scenery, textures, rig (rider), render, config and store. **No `index.html`**
yet; the racer module (physics, AI, posing, crash) was next.

### Bowbrawl (`web/games/archer/`, ~1,420 lines): unfinished
Modules for the 2D character rig, arenas, data, store and util, plus dev test pages (`dev/rigtest.html`,
`dev/bowtest.html`). **No `index.html`** yet.

### Hub (`web/index.html`): working
A purple starfield launcher with 6 animated cards. Each card reads `games/<id>/meta.json` (title, tagline,
thumbnail, best-score key) and shows "Coming soon" for games without an `index.html`. Screenshot:
`screenshots/hub/`. It needs a final polish pass once all games exist.

---

## 5. Honest assessment
- Sinkhole City and Murmur already look like shipped mobile games in still screenshots. Sinkhole City still **failed**
  its first blind review (2/6), and the reasons are concrete and fixable (see NEXT_STEPS.md).
- None of the six has passed the SHIP bar yet. The "loop until a harsh critic prefers ours blind" process has
  completed exactly one critic round.
- Blind comparisons are against still images of the originals, not live gameplay. Frame rates have only been
  measured in a software-rendered headless browser, so real-device performance is untested.
