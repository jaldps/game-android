# Next steps: what still needs to be done

Work paused on 2026-10-19 at your request. This is the complete to-do list for finishing the project to the
original bar: every game must look AAA and be preferred over the original in a blind side-by-side by a harsh,
independent critic.

## 0. Getting a workspace back
The agents' working state was in a cloud session; this repo is now the source of truth. To continue:
1. Clone this repo into the new workspace and put it at `/home/user/game-android` (the tools hard-code that path), or
   update the path in `tools/*.sh`.
2. `npm install` (for playwright-core, used by the screenshot tool).
3. Collect reference screenshots of the six originals again into `refs/<id>/` (see `refs/SOURCES.md`). They're
   needed by the critic and were deliberately not committed.
4. Have the Android SDK (platform 35), JDK 17+ and Gradle 8.x available for `tools/apk.sh`.

Suggested prompt to restart the loop with Claude:
> Continue the Clearplay Arcade project in jaldps/game-android. Read README.md, docs/PROJECT_HISTORY.md and
> docs/NEXT_STEPS.md. Re-run one builder agent per unfinished game using docs/briefs/_common.md + the game's
> brief, run a fresh harsh critic (CRITIC.md) per round, feed its fixes back to the builder, and loop until each
> game gets VERDICT: SHIP. Start by sending docs/reports/hole-critic-r1.md to a Sinkhole City builder.

## 1. Orchestration loop (per game)
```
builder (briefs/_common.md + briefs/<id>.md, SPEC.md) → self-reviews ≥6 rounds → report
  → fresh critic (CRITIC.md): own screenshots + ≥4 blind A/B vs refs, verdict before opening keys
  → NOT YET: ranked fixes → same builder fixes everything → new critic → …
  → SHIP: ≥75% blind wins + store-screenshot quality + zero console errors + input works
```
Keep screenshot runs serialized (`tools/shot.sh` uses a lock), because headless WebGL on 2 CPUs is slow. Use
`?warp=` / `?fixedstep=1` so screenshots show mid-game states.

## 2. Per-game to-do

### Sinkhole City (`hole`): critic round 1 = NOT YET (2/6). Apply all 15 fixes, then critic round 2
From `docs/reports/hole-critic-r1.md`, ranked:
1. **Late-game set-pieces:** raise the level cap to ~30; add 2–3 objects only a max-size hole can eat (mega
   spire, stadium, ferris wheel, cruise ship) with an objective callout ("Swallow the Spire!"), slow-mo topple,
   camera pull-back, light shafts and a debris swirl.
2. **Eaten city mustn't go empty:** craters, dirt and excavation texture, rubble, construction fences instead of flat
   green/concrete slabs; respawn mid-size props and pedestrians; an outer ring of tall buildings so the last 40 s
   still has food.
3. **Clip at the hole properly:** stencil/clip so nothing below ground shows outside the radius; draw the near
   half of the rim after falling objects; buildings tip in on a pivot instead of dropping upright.
4. **Camera:** lower (~50° pitch) and closer; the hole should be 20–25% of screen width at the start; show building
   fronts and parallax.
5. **Dangerous bots:** remove the 0.78 growth handicap (`BOT_GROW` in `config.js`), add rubber-banding, and make
   the top bot hunt the player.
6. **Opening:** spawn next to a food cluster; scatter cones, trash bags, bikes, benches and pigeons.
7. **Pit as abyss:** darker radial falloff into black, a shadow under the inner lip, a thinner solid rim; the halo
   only pulses on size-up; replace the striped blue inner wall.
8. **Swallow juice:** crumble/tilt, dust plume, debris, brief freeze on big eats, bigger shake; stack and merge
   score popups and keep them on screen.
9. **HUD overlaps:** "COMBO x98" overlaps the leaderboard; merge crown + LV + "You" into one pill; named combo
   tiers with a cap.
10. **Programmer-art props:** texture the kiosk box; parks need paths, flowerbeds, hedges and more tree variety.
11. **Pedestrians:** scale them ~1.3×, add panic/flee animations and scream bubbles near the hole.
12. **Menu:** fix the doubled tagline shadow; show a big hole eating something live behind the title.
13. **Economy:** +1,495 coins per round clears a ~5,800-coin shop in ~4 rounds, and the "Next skin 0/150" text is
    wrong; rebalance, and add XP, daily goals and unlockable maps.
14. **Variety:** at least two more map themes (beach/island, neon/purple city).
15. **Tech:** a ~40 s first frame with warp in headless runs; precompile shaders with `renderer.compile()`; check
    on a device.
Also from the builder's own list: the dotted look on faded buildings up close, bot level jumps, and debug hooks
(`__game.simulate`, `__dbg`) to remove or gate before release.

### Murmur (`original`): finish self-review, then critic round 1
- Let the builder finish its review rounds (it was screenshotting legs 2 and 5 when it stopped).
- Verify all 5 legs, the two-finger split, hawks, results screen, unlocks (4 flock species), settings, audio.
- Run critic round 1 against `refs/original/` (Alto's Odyssey frames).

### Frostline Dash (`sled`): build the actual game
- Replace the `test.js` scene viewer with `main.js`: the 3-lane runner loop, swipe input (L/R/up/down), obstacle
  spawning patterns, coins, power-ups (magnet, kite glide, 2×, shield, super-jump), yeti/guard pursuer, crash and
  revive-for-coins, missions, unlocks, HUD, menu/results, audio, curved-world shader.
- The required hooks (`?autoplay=1`, `?scene=`, `?warp=`), `meta.json` and `thumb.jpg`.
- Then the critic loop vs `refs/sled/`.

### Mob Rush (`crowd`): finish main.js and get it rendering
- Complete `main.js` (the builder stopped while writing it); fix whatever stops the first render (the headless
  load currently times out); add `meta.json` + `thumb.jpg`; then self-review rounds and the critic loop vs
  `refs/crowd/`.

### Ridgeline (`downhill`): write the racer and index.html
- Racer module (bike physics, steering, brake, pump/jump, power burst, AI rivals, rider posing, crash tumble),
  HUD (km/h, power/HP bars, position, time, minimap), menus/career, `index.html`, hooks, `meta.json`, `thumb.jpg`;
  then the critic loop vs `refs/downhill/`.

### Bowbrawl (`archer`): write the game shell and index.html
- Main loop: turns, drag-to-aim with a partial trajectory hint, wind, arrow flight camera with slow-mo, hit zones
  (headshot/body/limb), HP, AI with difficulty-scaled error, ladder/quick/2-player modes, coins and unlocks,
  results, audio, `index.html`, hooks, `meta.json`, `thumb.jpg`; then the critic loop vs `refs/archer/`
  (screenshots with `--landscape`).

## 3. Final release tasks
- Polish the hub (thumbnails for all six, best scores, transitions); verify every card launches its game and the
  back button returns to the hub.
- Prune `web/lib/addons` to only the files imported (shrinks the APK by ~20 MB).
- An adaptive launcher icon, a real release signing key, version bump.
- Test on a real mid-range Android phone: 60 fps target, orientation switching, audio unlock on first touch,
  pause/resume, back button in every screen.
- Rebuild `dist/ClearplayArcade.apk`.
