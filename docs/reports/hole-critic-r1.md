# Sinkhole City: harsh critic, round 1 (verbatim report, 2026-10-19)

Screenshot paths below refer to the original workspace (`/home/user/game-android/shots/hole/critic/`). The key images are
copied into `screenshots/hole-critic-r1/` in this repo.

## VERDICT: NOT YET

Ours was preferred in 2 of 6 blind pairings (33%). The bar is 75%. There were zero console errors and touch input works, but the game falls apart visually after the first minute.

### Blind tally (I wrote my picks to `blind/r1_verdicts.txt` before opening the keys)
- **p1: ours won.** Our LV5 plaza (fountain, cafe umbrellas, lit street, full HUD) beat an early ref frame that is a sparse grey close-up.
- **p2: ours won on art only.** Our shot is an empty intersection with a tiny LV1 hole and nothing happening. The ref shows a giant tower dropping into a hole that fills the frame, which is the stronger game moment.
- **p3: ref won.** The ref shows a dense, colourful city, the hole swallowing a whole block, and a "Find and Eat the Big Shiny Tower!" objective. Ours at 0:28 is a bare grid of flat green rectangles and empty concrete.
- **p4: ref won by a lot.** The ref has a tower set-piece: a deep pit, light shafts, falling debris and stars. Ours is the same empty grid.
- **p5: ref won.** The ref uses a close, tilted camera with a hero building sinking into a big hole. Ours has a tiny hole in a wide shot.
- **p6: ref won.** The ref shows a dense tilted city, a hero tower and a trail of stars. Ours is again the empty late-game grid.

### Scores (1–10)
| Area | Score | Why |
|---|---|---|
| Art direction | 6 | |
| Lighting / materials | 6 | |
| Environment detail | 5 | About 7 early, 2–3 late |
| Characters / animation | 4 | |
| UI / HUD | 6 | |
| Juice / feel | 5 | |
| Gameplay / controls | 5 | |
| Audio (from code) | 6 | Procedural sound effects plus a music loop, mute setting is saved |
| Technical | 7 | No errors; see fix 15 |

### Builder's admissions, checked
- **Weak late game: confirmed, and worse than admitted.** With 28s left the hole is at max level (LV19, r=14.85) and half the city is already flat green rectangles and bare concrete. There is nothing left worth chasing.
- **No set-pieces: confirmed.** Max level is capped at 19, and towers and landmarks are only about 13–14m wide, so everything in the city is edible by about 90s. There is no final objective.

### What I found beyond that
- **Bots are no threat.** Bots grow at 78% of the player's rate (`BOT_GROW` 0.78 in `config.js`), and the autoplay player finished at 18.7k against 5.6k for second place. The player is never in danger.
- **Dead opening.** In the real-input run the player spawned on an empty intersection and was 7th of 8 with 0 points after the first seconds, while bots were at 6–9.
- **Falling buildings draw over the near rim of the hole**, and the parts below ground show outside the circle. This kills the depth illusion. It is clearest in `r1_late_holecrop.png`.

### Fixes, ranked
1. **Add late-game set-pieces.** Raise the level cap to about 30. Add 2–3 objects only a max-size hole can eat: a mega spire, a stadium, a ferris wheel, a cruise ship on the waterfront. Each should get an objective callout ("Swallow the Spire!"), a slow-mo topple into the pit, a camera pull-back, light shafts and a swirl of debris.
2. **Fix the empty eaten city.** Swallowed lots currently leave flat green rectangles and bare slabs. Use craters, dirt and excavation texture, rubble, construction fences and puddles instead. Respawn mid-size props and pedestrians, and add an outer ring of tall buildings so the last 40s still has food.
3. **Clip objects properly at the hole.** Use a stencil or clip so nothing below ground level is visible outside the hole radius, and draw the near half of the rim after falling objects. Buildings should tip in from the edge on a pivot, not drop in upright.
4. **Rework the camera.** At LV1 the hole is only about 12% of screen width and the view is a flat high top-down. Bring it lower (about 50° pitch) and closer, so the hole is 20–25% of the width and building fronts and parallax show, as in the refs. Keep the pull-back as the hole grows, but tilt more.
5. **Make bots dangerous.** Remove the bot growth penalty, add rubber-banding so the top bot keeps up with and hunts the player, and make getting eaten a real risk in every round.
6. **Fix the opening.** Spawn the player next to a food cluster. Scatter cones, trash bags, bikes, benches and pigeons along roads so the first five seconds pay out.
7. **Make the pit read as an abyss.** The big pale translucent halo around the rim washes out the ground. The inner wall shader reads as a striped blue tube. Use a darker radial falloff into black, a shadow under the inner lip, and a thinner solid rim, and only pulse the halo on size-up.
8. **Add swallow juice.** Big objects need a crumble or tilt, a dust plume, debris chunks, a brief freeze or slow-mo on large eats, and a bigger shake. Score popups overlap ("+2+40") and get clipped at the screen edge ("+18"): stack and merge them, and keep them on screen.
9. **Clean up HUD overlaps.** "COMBO x98" sits on top of the leaderboard. The crown + "LV" + "You" label stack is too tall, so merge it into one pill. A combo of x100 means nothing: use named tiers and cap the count.
10. **Replace programmer-art props.** The kiosk next to the LV5 hole is an untextured cream box. Parks are plain green rectangles. Add textured roofs and signage, park paths, flowerbeds, hedges and more tree variety.
11. **Make pedestrians readable.** They are tiny. Scale them about 1.3x and add panic and flee animations plus scream bubbles when the hole gets close.
12. **Fix the menu.** The tagline has a doubled ghost shadow that is hard to read against the street. The title covers the backdrop hole, which is barely visible anyway. Show a big hole eating something live behind the menu.
13. **Fix the coin economy.** The results screen gives +1,495 coins for one round, while skins cost 150–2,000 (about 5,800 in total), so the shop is cleared in about 4 rounds. The same screen says "Next skin: Sunset — 0/150", which contradicts the payout. Rebalance coins and prices, and add XP, daily goals and unlockable maps.
14. **Add variety.** There is one city theme. The refs show beach, island and purple-city maps. Add at least two more.
15. **Technical.** In headless runs, `warp=15` took about 40s before the first frame, and menu/results/warp shots time out against the default 30s screenshot timeout, while the sim itself measured about 3ms per step. That points at first-frame or shader-compile cost; precompile with `renderer.compile()` and check on a device. Not judged as device performance.

### How I got the shots
`tools/shot.sh` hit its 30s screenshot timeout on the menu and results scenes and on warp runs. I worked around it with a copy of `shot.mjs` in my scratchpad that has a 150s timeout and logs player state after each event. The late-game shots used `--eval` to run `__game.simulate(92)` instead of `warp`. (The repo's shot tool has since been raised to 150 s.)

The real-input test went menu → tap PLAY → swipe right (player x went from 85.4 to 89.9) → swipe up (z went from 86.2 to 81.6). Every console log has no errors.

Refs used: `C96uBPdJX2I_hq1`, `C96uBPdJX2I_maxresdefault`, `WCX53VzUD2c_hq1`, `WCX53VzUD2c_maxresdefault`, `ramavK7J6lc_hq2`, `ALj4jU7Tz5o_maxresdefault`. Crops were 0.295–0.705 for the 4:3 frames and 0.345–0.655 for the 16:9 frames.
